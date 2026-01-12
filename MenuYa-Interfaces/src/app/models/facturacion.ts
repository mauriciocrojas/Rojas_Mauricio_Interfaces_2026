// src/app/models/facturacion.ts
export type ItemFactura = { nombre: string; cantidad: number; precioUnit: number; };

export type DetalleCuenta = {
  numeroPedido: number;
  items: ItemFactura[];
  subtotal: number;
  descuentoJuegos?: number; // $
  propina?: number;          // $
  total: number;
};

export type DatosCliente = {
  nombre: string;
  email: string;

  // Opcionales (para delivery o clientes completos)
  dni?: string;
  domicilio?: string;
};
