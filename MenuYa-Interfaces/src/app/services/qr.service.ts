import { Injectable } from '@angular/core';
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';
import * as QRCode from 'qrcode';

@Injectable({
  providedIn: 'root'
})
export class QrService {
  /**
   * Verifica y solicita permisos de cámara según plugin disponible.
   * Soporta tanto la API nueva (scan/checkPermissions) como la del plugin community.
   */
  async ensurePermissions(): Promise<boolean> {
    const anyScanner = BarcodeScanner as any;

    // API nueva (p.ej. ML Kit): checkPermissions / requestPermissions
    if (typeof anyScanner.checkPermissions === 'function') {
      const status = await anyScanner.checkPermissions();
      if (status?.camera === 'granted') return true;
      const req = await anyScanner.requestPermissions?.();
      return req?.camera === 'granted';
    }

    // Plugin community: checkPermission({ force })
    const status = await (BarcodeScanner as any).checkPermission?.({ force: false });
    if (status?.granted) return true;
    const forced = await (BarcodeScanner as any).checkPermission?.({ force: true });
    return !!forced?.granted;
  }

  /**
   * Escanea un código y devuelve el contenido como string, o null si no hay.
   * Intenta primero la API nueva (scan -> { barcodes }), y cae al plugin community (startScan).
   */
  async scanOnce(): Promise<string | null> {
    const hasPerm = await this.ensurePermissions();
    if (!hasPerm) return null;

    const anyScanner = BarcodeScanner as any;

    // API nueva: scan() -> { barcodes }
    if (typeof anyScanner.scan === 'function') {
      const { barcodes } = await anyScanner.scan();
      const first = barcodes?.[0];
      const value = first?.rawValue ?? first?.displayValue ?? null;
      return value ?? null;
    }

    // Plugin community: startScan()/stopScan() y hide/showBackground()
    try { await (BarcodeScanner as any).hideBackground?.(); } catch {}
    const result = await (BarcodeScanner as any).startScan?.();
    try { await (BarcodeScanner as any).showBackground?.(); } catch {}
    try { await (BarcodeScanner as any).stopScan?.(); } catch {}

    if (result?.hasContent) return result.content as string;
    return null;
  }

  /**
   * Intenta detener un escaneo activo y restaurar UI.
   */
  async stop(): Promise<void> {
    try { await (BarcodeScanner as any).showBackground?.(); } catch {}
    try { await (BarcodeScanner as any).stopScan?.(); } catch {}
  }

    // Genera un Data URL (base64) con el número de mesa codificado en el QR
  async generarQrMesa(numeroMesa: number | string): Promise<string> {
    const contenido = String(numeroMesa).trim();
    if (!contenido) {
      throw new Error('El número de mesa es requerido');
    }

    return QRCode.toDataURL(contenido, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
  });
  }
}
