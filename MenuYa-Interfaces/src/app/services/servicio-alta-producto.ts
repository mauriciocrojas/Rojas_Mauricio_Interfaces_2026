import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { supabase } from '../supabase.client';
import { PostgrestError } from '@supabase/supabase-js';
import { StorageError } from '@supabase/storage-js';
type ErrorOptions = { cause?: unknown };

export interface Producto {
  nombre: string;
  descripcion: string;
  precio: number;
  tiempo: number;
  categoria: string;
}

export interface ProductoRow extends Producto {
  path_imagenes: string[];
  bucket_imagenes: typeof BUCKET_IMAGENES;
}

export type DomainErrorCode = 'VALIDATION' | 'UPLOAD_FAILED' | 'DB_CONFLICT' | 'DB_ERROR';

export type ProductoConUrls = ProductoRow & { urls_imagenes: string[] };

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: unknown;

  constructor(code: DomainErrorCode, message: string, options?: ErrorOptions & { details?: unknown }) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'DomainError';
    this.code = code;
    this.details = options?.details;
  }
}

const BUCKET_IMAGENES = 'menuYA_productos_imagenes';
const MAX_FILES_ALLOWED = 3;
const ALLOWED_MIME_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/webp']);
const DEFAULT_MAX_FILE_MB = 5;
const FILE_UPLOAD_RETRIES = 1;
const RANDOM_SUFFIX_LENGTH = 8;
const UPLOAD_RETRY_DELAY_MS = 150;
const TABLA = 'menuYa_productos';

export function slugifyNombre(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function sanitizeFileName(fileName: string): string {
  const lower = fileName.trim().toLowerCase();
  const index = lower.lastIndexOf('.');
  const base = index > 0 ? lower.slice(0, index) : lower;
  const ext = index > 0 ? lower.slice(index) : '';
  const sanitizedBase = base
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const safeBase = sanitizedBase || 'archivo';
  const safeExt = ext.replace(/[^.a-z0-9]/g, '');
  return `${safeBase}${safeExt}`;
}

@Injectable({
  providedIn: 'root'
})

export class ProductoService {
  private readonly bucket = BUCKET_IMAGENES;
  private readonly maxFileSizeBytes = DEFAULT_MAX_FILE_MB * 1024 * 1024;
  private readonly supabase = supabase;
  pedidos?: Observable<any>;
    // 🔴 NUEVO: cache reactivo por categoría
  private productosPorCategoriaSubjects = new Map<string, BehaviorSubject<ProductoConUrls[]>>();

  constructor() {}

  async crearProducto(producto: Producto, archivos: readonly File[] = []): Promise<ProductoRow> {
    const normalizedProducto = this.normalizeProducto(producto);
    const files = [...(archivos ?? [])];
    this.validateFiles(files);

    const slug = slugifyNombre(normalizedProducto.nombre);
    if (!slug) {
      throw new DomainError('VALIDATION', 'El nombre del producto debe contener al menos un carácter alfanumérico.');
    }

    const uploadedPaths: string[] = [];
    try {
      for (const file of files) {
        const path = await this.uploadFileWithRetry(file, slug);
        uploadedPaths.push(path);
      }

      const insertPayload: ProductoRow = {
        ...normalizedProducto,
        path_imagenes: uploadedPaths,
        bucket_imagenes: this.bucket,
      };

      console.log('Insert payload ->', insertPayload);
      // Verifica si ya existe un producto con el mismo nombre
      const existeProducto = await this.getProductoPorNombre(insertPayload.nombre);
      console.error('existeProducto', existeProducto);
      if (existeProducto != null) {
        throw new DomainError('DB_CONFLICT', `Ya existe un producto con nombre "${producto.nombre}".`);
      }
      
      const { data, error } = await this.supabase
        .from(TABLA)
        .insert([insertPayload], { count: 'exact' })
        .select()
        .single();

      if (error) {
        throw this.mapPostgrestError(error);
      }

      if (!data) {
        throw new DomainError('DB_ERROR', 'La base de datos no devolvió el producto recién insertado.');
      }

      // 🔴 NUEVO: refrescamos la categoría en segundo plano
      this.refrescarCategoria(insertPayload.categoria).catch((err) => {
        console.error('[ProductoService] No se pudo refrescar la categoría después de crear producto', err);
      });

      return data;
    } catch (error) {
      const domainError = error instanceof DomainError ? error : this.wrapUnknownError(error);
      const rollbackFailure = await this.rollbackUploadedPaths(uploadedPaths);
      if (rollbackFailure) {
        throw new DomainError(
          'UPLOAD_FAILED',
          'Falló la creación del producto y no se pudieron eliminar las imágenes subidas. Contacta al soporte.',
          {
            cause: domainError,
            details: { uploadedPaths, rollbackError: rollbackFailure.message },
          },
        );
      }
      throw domainError;
    }
  }

  /**
   * Devuelve todos los productos con URLs públicas de todas sus imágenes.
   */
  async listarProductosConImagenes(): Promise<Array<ProductoRow & { urls_imagenes: string[] }>> {
    const { data, error } = await this.supabase
      .from(TABLA)
      .select('*');

    if (error) {
      throw this.mapPostgrestError(error);
    }

    const rows = (data ?? []) as ProductoRow[];

    return rows.map((row) => {
      const urls: string[] = Array.isArray(row.path_imagenes)
        ? row.path_imagenes
            .filter((p): p is string => typeof p === 'string' && !!p)
            .map((p) => {
              const { data: pub } = this.supabase.storage
                .from(BUCKET_IMAGENES)
                .getPublicUrl(p);
              return pub?.publicUrl ?? '';
            })
            .filter((u) => !!u)
        : [];

      return { ...row, urls_imagenes: urls };
    });
  }

  async listarProductosPorCategoria(categoria: string): Promise<Array<ProductoRow & { urls_imagenes: string[] }>> {
    const { data, error } = await this.supabase
      .from(TABLA)
      .select('*')
      .eq('categoria', categoria); 
    if (error) {
      throw this.mapPostgrestError(error);
    }
    const rows = (data ?? []) as ProductoRow[];

    return rows.map((row) => {
      const urls: string[] = Array.isArray(row.path_imagenes)
        ? row.path_imagenes
            .filter((p): p is string => typeof p === 'string' && !!p)
            .map((p) => {
              const { data: pub } = this.supabase.storage
                .from(BUCKET_IMAGENES)
                .getPublicUrl(p);
              return pub?.publicUrl ?? '';
            })
            .filter((u) => !!u)
        : [];
      return { ...row, urls_imagenes: urls };
    });
  }

  // 🔴 NUEVO: observable en tiempo real para una categoría
  observarProductosPorCategoria(categoria: string): Observable<ProductoConUrls[]> {
    let subject = this.productosPorCategoriaSubjects.get(categoria);

    if (!subject) {
      // Comenzamos vacío hasta que llegue la primera carga
      subject = new BehaviorSubject<ProductoConUrls[]>([]);
      this.productosPorCategoriaSubjects.set(categoria, subject);

      // Disparamos la carga inicial en segundo plano
      this.refrescarCategoria(categoria).catch((err) => {
        // Podés loguear el error acá
        console.error('[ProductoService] Error al refrescar categoría inicial', err);
      });
    }

    return subject.asObservable();
  }

  // 🔴 NUEVO: recarga desde Supabase y emite en el BehaviorSubject
  private async refrescarCategoria(categoria: string): Promise<void> {
    const productos = await this.listarProductosPorCategoria(categoria);
    let subject = this.productosPorCategoriaSubjects.get(categoria);

    if (!subject) {
      subject = new BehaviorSubject<ProductoConUrls[]>(productos);
      this.productosPorCategoriaSubjects.set(categoria, subject);
    } else {
      subject.next(productos);
    }
  }

  private normalizeProducto(producto: Producto): Producto {
    const nombre = producto.nombre?.trim().toLowerCase();
    const descripcion = producto.descripcion?.trim();
    const categoria = producto.categoria?.trim();
    const normalizedNombre = nombre.normalize('NFKC').toLowerCase().replace(/\s+/g, '_');

    if (!nombre) {
      throw new DomainError('VALIDATION', 'El nombre del producto es obligatorio.');
    }
    if (!descripcion) {
      throw new DomainError('VALIDATION', 'La descripción del producto es obligatoria.');
    }
    if (!categoria) {
      throw new DomainError('VALIDATION', 'La categoría del producto es obligatoria.');
    }
    if (!Number.isFinite(producto.precio) || producto.precio <= 0) {
      throw new DomainError('VALIDATION', 'El precio debe ser un número mayor a cero.');
    }
    if (!Number.isFinite(producto.tiempo) || producto.tiempo <= 0) {
      throw new DomainError('VALIDATION', 'El tiempo debe ser un número mayor a cero.');
    }

    return {
      nombre: normalizedNombre,
      descripcion,
      categoria,
      precio: producto.precio,
      tiempo: Math.trunc(producto.tiempo),
    };
  }

async getProductoPorNombre(nombre: string): Promise<(ProductoRow & { primer_path_imagen: string | null; url_imagen: string | null }) | null> {
  const { data, error } = await this.supabase
    .from(TABLA)
    .select('*')
    .eq('nombre', nombre)
    .single();

  console.log('getProductoPorNombre data ->', data);
  if (data === null) {
    return null;
  }
  if (error || !data) {
    if (error?.code === 'PGRST116') {
      throw new DomainError('DB_ERROR', `Producto con nombre "${nombre}" no encontrado`);
    }
    throw new Error(
      `No se pudo obtener el producto "${nombre}": ${error?.message ?? 'error desconocido'}`
    );
  }

  let primerPathImagen: string | null = null;
  let urlImagen: string | null = null;

  if (Array.isArray(data.path_imagenes) && typeof data.path_imagenes[0] === 'string') {
    primerPathImagen = data.path_imagenes[0];
    const { data: publicUrlData } = this.supabase
      .storage
      .from(BUCKET_IMAGENES)
      .getPublicUrl(primerPathImagen);

    urlImagen = publicUrlData?.publicUrl ?? null;
  }

    return {
      ...data,
      primer_path_imagen: primerPathImagen,
      url_imagen: urlImagen,
    };
  }
  
    private validateFiles(files: readonly File[]): void {
    if (files.length > MAX_FILES_ALLOWED) {
      throw new DomainError('VALIDATION', `Se permiten hasta ${MAX_FILES_ALLOWED} imágenes por producto.`);
    }

    files.forEach((file) => {
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        throw new DomainError('VALIDATION', `El archivo "${file.name}" no es un tipo de imagen permitido.`);
      }
      if (file.size > this.maxFileSizeBytes) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        throw new DomainError(
          'VALIDATION',
          `El archivo "${file.name}" pesa ${sizeMb} MB y supera el máximo permitido de ${DEFAULT_MAX_FILE_MB} MB.`,
        );
      }
    });
  }

  private async uploadFileWithRetry(file: File, slug: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= FILE_UPLOAD_RETRIES; attempt += 1) {
      const sanitizedName = sanitizeFileName(file.name);
      const candidatePath = this.generateStoragePath(slug, sanitizedName);
      try {
        const { error } = await this.supabase.storage
          .from(this.bucket)
          .upload(candidatePath, file, { contentType: file.type, upsert: false });

        if (error) {
          throw error;
        }

        return candidatePath;
      } catch (error) {
        lastError = error;
        if (attempt < FILE_UPLOAD_RETRIES) {
          await this.delay(UPLOAD_RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    throw this.wrapUploadError(file, lastError);
  }

  private async rollbackUploadedPaths(paths: readonly string[]): Promise<StorageError | null> {
    if (paths.length === 0) {
      return null;
    }
    const { error } = await this.supabase.storage.from(this.bucket).remove([...paths]);
    return error ?? null;
  }

  private mapPostgrestError(error: PostgrestError): DomainError {
    if (error.code === '23505' || error.details?.includes('already exists') || error.message.includes('duplicate')) {
      return new DomainError('DB_CONFLICT', 'Ya existe un producto con ese nombre.', {
        cause: error,
        details: { hint: error.hint },
      });
    }
    return new DomainError('DB_ERROR', `Error al guardar el producto: ${error.message}`, {
      cause: error,
      details: { code: error.code, hint: error.hint },
    });
  }

  private wrapUploadError(file: File, error: unknown): DomainError {
    if (error instanceof DomainError) {
      return error;
    }
    if (this.isStorageError(error)) {
      return new DomainError(
        'UPLOAD_FAILED',
        `No se pudo subir la imagen "${file.name}". ${error.message}`,
        { cause: error },
      );
    }
    if (error instanceof Error) {
      return new DomainError('UPLOAD_FAILED', `No se pudo subir la imagen "${file.name}". ${error.message}`, {
        cause: error,
      });
    }
    return new DomainError('UPLOAD_FAILED', `No se pudo subir la imagen "${file.name}".`, { details: error });
  }

  private wrapUnknownError(error: unknown): DomainError {
    if (error instanceof DomainError) {
      return error;
    }
    if (this.isPostgrestError(error)) {
      return this.mapPostgrestError(error);
    }
    if (this.isStorageError(error)) {
      return new DomainError('UPLOAD_FAILED', error.message, { cause: error });
    }
    if (error instanceof Error) {
      return new DomainError('DB_ERROR', error.message, { cause: error });
    }
    return new DomainError('DB_ERROR', 'Ocurrió un error desconocido al crear el producto.', { details: error });
  }

  private generateStoragePath(slug: string, sanitizedFileName: string): string {
    const timestamp = Date.now();
    const randomSuffix = this.randomSuffix(RANDOM_SUFFIX_LENGTH);
    return `${slug}/${timestamp}-${randomSuffix}-${sanitizedFileName}`;
  }

  private randomSuffix(length: number): string {
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let i = 0; i < length; i += 1) {
      const index = Math.floor(Math.random() * characters.length);
      suffix += characters.charAt(index);
    }
    return suffix;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private isPostgrestError(error: unknown): error is PostgrestError {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'message' in error &&
        'code' in error &&
        'details' in error &&
        'hint' in error,
    );
  }

  private isStorageError(error: unknown): error is StorageError {
    return Boolean(error && typeof error === 'object' && 'message' in error && 'name' in error && (error as StorageError).name === 'StorageError');
  }
}
