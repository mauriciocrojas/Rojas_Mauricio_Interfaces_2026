import { Injectable } from '@angular/core';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
(pdfMake as any).vfs = (pdfFonts as any).vfs;

import type { DetalleCuenta, DatosCliente } from 'src/app/models/facturacion';

@Injectable({ providedIn: 'root' })
export class FacturaPdfService {

  // 👉 Ajustá estos datos fijos a lo que corresponda
  private readonly cuitRestaurante = '20-36828997-0';
  private readonly condIvaRestaurante = 'Responsable Inscripto';
  private readonly ingresosBrutos = 'Exento';
  private readonly inicioActividades = '01/01/2025';
  private readonly puntoVenta = '00001';

  // Condición frente al IVA del cliente (puede ser dinámico si lo guardás)
  private readonly condIvaClienteDefault = 'Consumidor Final';

  // Datos CAE de ejemplo
  private readonly caeNumero = '8796541657';
  private readonly caeVto = '01/01/2026';

  private async logoDataUrl(): Promise<string> {
    const res = await fetch('assets/icon/favicon.png');
    const blob = await res.blob();
    return new Promise<string>((ok) => {
      const reader = new FileReader();
      reader.onload = () => ok(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  private formatMoney(v: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(v);
  }

  // Versión sin símbolo $ (para columnas de % / importes sueltos)
  private formatNumber2Dec(v: number) {
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(v);
  }

  async generarFacturaPdf(params: {
    restauranteNombre: string,
    restauranteDireccion: string,
    datosCliente: DatosCliente,
    detalle: DetalleCuenta,
    numeroFactura?: string,
    fecha?: Date,
  }): Promise<{ base64: string; numeroFactura: string; fecha: string; fileName: string; }> {

    console.log('[FacturaPdfService] VERSIÓN AJUSTADA EJECUTÁNDOSE');

    const fecha = params.fecha ?? new Date();

    const fechaSolo = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' }).format(fecha);
    const horaSolo = new Intl.DateTimeFormat('es-AR', { timeStyle: 'medium' }).format(fecha);
    const fechaYHora = `${fechaSolo}, ${horaSolo}`;

    const fechaStrMail = new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(fecha);

    const numeroFactura = params.numeroFactura
      ?? `FAC-${fecha.toISOString().slice(0, 10).replace(/-/g, '')}-${params.detalle.numeroPedido}`;

    const fileName = `${numeroFactura}.pdf`;
    const logo = await this.logoDataUrl();

    // 👉 Recalcular números para que el PDF muestre lo mismo que la app
    const subtotal = Number(params.detalle.subtotal ?? 0);
    const descuento = Number(params.detalle.descuentoJuegos ?? 0);
    const propina = Number(params.detalle.propina ?? 0);

    const base = Math.max(subtotal - descuento, 0);
    const totalCalc = +(base + propina).toFixed(2);

    const descuentoPctLabel = subtotal > 0 ? Math.round((descuento * 100) / subtotal) : 0;
    const propinaPctLabel = base > 0 ? Math.round((propina * 100) / base) : 0;

    const numeroPedido = params.detalle.numeroPedido ?? '';

    // ------------------ TABLA DE ÍTEMS (estilo AFIP) ------------------
    const bodyItems: any[] = [[
      { text: 'Código', style: 'thSmall', alignment: 'left' },
      { text: 'Producto / Servicio', style: 'thSmall', alignment: 'left' },
      { text: 'Cantidad', style: 'thSmall', alignment: 'right' },
      { text: 'Medida', style: 'thSmall', alignment: 'center' },
      { text: 'Precio Unit.', style: 'thSmall', alignment: 'right' },
      { text: 'Subtotal', style: 'thSmall', alignment: 'right' },
      { text: 'Alicuota IVA', style: 'thSmall', alignment: 'right' },
      { text: 'Subtotal c/IVA', style: 'thSmall', alignment: 'right' },
    ]];

    params.detalle.items.forEach((it, idx) => {
      const cantidadNum = typeof it.cantidad === 'number' ? it.cantidad : Number(it.cantidad);
      const importe = cantidadNum * it.precioUnit;

      bodyItems.push([
        { text: String(idx + 1), alignment: 'left' },
        { text: it.nombre, alignment: 'left' },
        {
          text: this.formatNumber2Dec(cantidadNum),
          alignment: 'right',
          noWrap: true
        },
        { text: 'unidad', alignment: 'center' },   // Ajustalo si tenés unidad real
        {
          text: this.formatMoney(it.precioUnit),
          alignment: 'right',
          noWrap: true
        },
        {
          text: this.formatMoney(importe),
          alignment: 'right',
          noWrap: true
        },
        { text: '0,00', alignment: 'right' },      // Alicuota IVA (monotributo -> 0)
        {
          text: this.formatMoney(importe),
          alignment: 'right',
          noWrap: true
        },
      ]);
    });

    // ------------------ DATOS CLIENTE ------------------
    const condicionVenta = 'Contado'; // Podés dinamizarlo
    const nombreCliente = params.datosCliente.nombre || 'Cliente';
    const dniCliente = params.datosCliente.dni || '—';
    const domicilioCliente = (params.datosCliente as any).domicilio || '—';
    const condIvaCliente = this.condIvaClienteDefault;

    // ------------------ TOTALES (SUBTOTAL / DTO / PROPINA / TOTAL) ------------------
    const rowsTotales: any[] = [
      [
        { text: 'Subtotal: $', alignment: 'right' },
        { text: this.formatNumber2Dec(subtotal), alignment: 'right', noWrap: true }
      ]
    ];

    if (descuento > 0) {
      rowsTotales.push([
        {
          text:
            descuentoPctLabel > 0
              ? `Descuento juegos (${descuentoPctLabel}%): $`
              : 'Descuento juegos: $',
          alignment: 'right'
        },
        {
          text: `- ${this.formatNumber2Dec(descuento)}`,
          alignment: 'right',
          noWrap: true
        }
      ]);
    }

    if (propina > 0) {
      rowsTotales.push([
        {
          text:
            propinaPctLabel > 0
              ? `Propina (${propinaPctLabel}%): $`
              : 'Propina: $',
          alignment: 'right'
        },
        {
          text: this.formatNumber2Dec(propina),
          alignment: 'right',
          noWrap: true
        }
      ]);
    }

    rowsTotales.push([
      { text: 'Importe Total: $', alignment: 'right', bold: true },
      { text: this.formatNumber2Dec(totalCalc), alignment: 'right', bold: true, noWrap: true }
    ]);

    // ------------------ DOC DEFINITION ------------------
    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [20, 20, 20, 40],
      content: [
        // Banda "ORIGINAL"
        {
          table: {
            widths: ['*'],
            body: [[
              {
                text: 'ORIGINAL',
                bold: true,
                fontSize: 16,
                alignment: 'center',
                margin: [0, 3, 0, 3]
              }
            ]]
          },
          layout: {
            hLineWidth: (i: number) => (i === 0 ? 1.5 : 0),
            vLineWidth: () => 1.5
          },
          margin: [0, 0, 0, 2]
        },

        // Bloque superior: Restaurante / FACTURA / Letra C
        {
          table: {
            widths: ['*', 60, '*'],
            body: [[
              // Izquierda: datos restaurante
              {
                border: [1.5, 1.5, 0, 1.5],
                margin: [5, 5, 5, 5],
                stack: [
                  {
                    text: params.restauranteNombre,
                    alignment: 'center',
                    bold: true,
                    fontSize: 20,
                    margin: [0, 0, 0, 3]
                  },
                  {
                    fontSize: 10,
                    lineHeight: 1.3,
                    text: [
                      { text: 'Razón Social: ', bold: true }, params.restauranteNombre + '\n',
                      { text: 'Domicilio: ', bold: true }, params.restauranteDireccion + '\n',
                      { text: 'CUIT: ', bold: true }, this.cuitRestaurante + '\n',
                      { text: 'Ingresos Brutos: ', bold: true }, this.ingresosBrutos + '\n',
                      { text: 'Condición frente al IVA: ', bold: true }, this.condIvaRestaurante + '\n',
                      { text: 'Fecha de Inicio de Actividades: ', bold: true }, this.inicioActividades
                    ]
                  }
                ]
              },
              // Centro: Letra C recuadrada
              {
                border: [0, 1.5, 0, 1.5],
                margin: [0, 5, 0, 5],
                alignment: 'center',
                table: {
                  widths: ['*'],
                  body: [
                    [
                      {
                        text: 'C',
                        alignment: 'center',
                        bold: true,
                        fontSize: 34,
                        margin: [0, 0, 0, 2]
                      }
                    ],
                    [
                      {
                        text: 'COD. 007',
                        alignment: 'center',
                        fontSize: 9
                      }
                    ]
                  ]
                },
                layout: {
                  hLineWidth: () => 1.5,
                  vLineWidth: () => 1.5
                }
              },
              // Derecha: FACTURA + datos AFIP + N° de pedido
              {
                border: [0, 1.5, 1.5, 1.5],
                margin: [20, 5, 5, 5],
                stack: [
                  {
                    text: 'FACTURA',
                    alignment: 'center',
                    bold: true,
                    fontSize: 20,
                    margin: [0, 0, 0, 3]
                  },
                  {
                    fontSize: 9,
                    lineHeight: 1.3,
                    text: [
                      { text: 'Punto de Venta: ', bold: true }, this.puntoVenta, '\n',
                      { text: 'Comp. Nro: ', bold: true }, `${numeroFactura}`, '\n',
                      { text: 'N° de Pedido: ', bold: true }, String(numeroPedido), '\n',
                      { text: 'Fecha de Emisión: ', bold: true }, fechaYHora
                    ]
                  }
                ]
              }
            ]]
          },
          layout: {
            defaultBorder: false
          },
          margin: [0, 0, 0, 0]
        },

        // 👉 Línea vertical debajo del recuadro "C" hasta la siguiente banda
        {
          table: {
            widths: ['*', 60, '*'],
            body: [[
              { text: '', border: [0, 0, 0, 0] },
              {
                text: ' ',
                border: [1.5, 0, 1.5, 0],
                margin: [0, 0, 0, 18] // altura del tramo vertical
              },
              { text: '', border: [0, 0, 0, 0] }
            ]]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0
          },
          margin: [0, 0, 0, 0]
        },

        // Período facturado
        {
          table: {
            widths: ['*', '*', '*'],
            body: [[
              {
                text: [
                  { text: 'Período Facturado Desde: ', bold: true },
                  fechaSolo
                ],
                fontSize: 9
              },
              {
                text: [
                  { text: 'Hasta: ', bold: true },
                  fechaSolo
                ],
                fontSize: 9
              },
              {
                text: [
                  { text: 'Fecha de Vto. para el pago: ', bold: true },
                  fechaSolo
                ],
                fontSize: 9
              }
            ]]
          },
          layout: {
            hLineWidth: () => 1.5,
            vLineWidth: () => 1.5
          },
          margin: [0, 2, 0, 2]
        },

        // Datos del cliente + N° de pedido en detalles
        {
          table: {
            widths: ['*'],
            body: [
              [
                {
                  text: 'Datos del cliente',
                  style: 'sectionTitle',
                  alignment: 'left'
                }
              ],
              [
                {
                  margin: [5, 3, 5, 4],
                  stack: [
                    {
                      text: [
                        { text: 'CUIT / DNI: ', bold: true },
                        dniCliente
                      ],
                      fontSize: 9,
                      margin: [0, 1, 0, 0]
                    },
                    {
                      text: [
                        { text: 'Apellido y Nombre / Razón Social: ', bold: true },
                        nombreCliente
                      ],
                      fontSize: 9,
                      margin: [0, 1, 0, 0]
                    },
                    {
                      text: [
                        { text: 'Condición frente al IVA: ', bold: true },
                        condIvaCliente
                      ],
                      fontSize: 9,
                      margin: [0, 1, 0, 0]
                    },
                    {
                      text: [
                        { text: 'Domicilio: ', bold: true },
                        domicilioCliente
                      ],
                      fontSize: 9,
                      margin: [0, 1, 0, 0]
                    },
                    {
                      text: [
                        { text: 'Condición de venta: ', bold: true },
                        condicionVenta
                      ],
                      fontSize: 9,
                      margin: [0, 1, 0, 0]
                    },
                    {
                      text: [
                        { text: 'N° de Pedido: ', bold: true },
                        String(numeroPedido)
                      ],
                      fontSize: 9,
                      margin: [0, 1, 0, 0]
                    }
                  ]
                }
              ]
            ]
          },
          layout: {
            hLineWidth: () => 1.5,
            vLineWidth: () => 1.5
          },
          margin: [0, 2, 0, 4]
        },

        // Tabla de detalle (ítems)
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body: bodyItems
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5
          },
          fontSize: 8,
          margin: [0, 4, 0, 4]
        },

        // Otros tributos + Totales en recuadro
        {
          columns: [
            // Otros tributos
            {
              width: '55%',
              margin: [0, 20, 0, 0],
              table: {
                headerRows: 1,
                widths: [200, '*', 'auto', 'auto'],
                body: [
                  [
                    { text: 'Descripción', style: 'thSmall' },
                    { text: 'Detalle', style: 'thSmall' },
                    { text: 'Alíc. %', style: 'thSmall', alignment: 'right' },
                    { text: 'Importe', style: 'thSmall', alignment: 'right' }
                  ],
                  [
                    'Percepción / Retención de Impuesto a las Ganancias',
                    '',
                    '',
                    this.formatNumber2Dec(0)
                  ],
                  [
                    'Percepción / Retención de IVA',
                    '',
                    '',
                    this.formatNumber2Dec(0)
                  ],
                  [
                    'Impuestos Internos',
                    '',
                    '',
                    this.formatNumber2Dec(0)
                  ],
                  [
                    'Impuestos Municipales',
                    '',
                    '',
                    this.formatNumber2Dec(0)
                  ]
                ]
              },
              layout: {
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5
              }
            },
            { width: '5%', text: '' },
            // Resumen de totales en recuadro propio
            {
              width: '40%',
              margin: [0, 20, 0, 0],
              table: {
                widths: ['*', 'auto'],
                body: rowsTotales
              },
              layout: {
                hLineWidth: (i: number, node: any) =>
                  (i === 0 || i === node.table.body.length) ? 0.5 : 0,
                vLineWidth: () => 0.5
              }
            }
          ],
          margin: [0, 0, 0, 0]
        },

        // Recuadro CAE separado, debajo de los recuadros anteriores
        {
          alignment: 'right',
          margin: [0, 12, 0, 0],
          table: {
            widths: ['auto', 'auto'],
            body: [
              [
                {
                  text: 'CAE N°:',
                  alignment: 'right',
                  bold: true,
                  noWrap: true
                },
                {
                  text: this.caeNumero,
                  alignment: 'left',
                  noWrap: true
                }
              ],
              [
                {
                  text: 'Fecha de Vto. de CAE:',
                  alignment: 'right',
                  bold: true,
                  noWrap: true
                },
                {
                  text: this.caeVto,
                  alignment: 'left',
                  noWrap: true
                }
              ]
            ]
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5
          }
        },

        // "Comprobante Autorizado" centrado debajo del recuadro CAE (más abajo)
        {
          text: 'Comprobante Autorizado',
          italics: true,
          bold: true,
          fontSize: 11,
          alignment: 'center',
          margin: [0, 30, 0, 0]
        },

        // Logo MenuYa debajo del texto de comprobante
        {
          image: logo,
          width: 80,
          alignment: 'center',
          margin: [0, 8, 0, 0]
        },

        // Leyenda AFIP en letra chiquita
        {
          text: 'Esta Administración Federal no se responsabiliza por los datos ingresados en el detalle de la operación',
          italics: true,
          fontSize: 7,
          alignment: 'center',
          margin: [0, 6, 0, 0]
        },

        // Número de página
        {
          text: 'Pág 1/1',
          alignment: 'center',
          bold: true,
          fontSize: 9,
          margin: [0, 6, 0, 0]
        }
      ],
      styles: {
        thSmall: {
          fontSize: 8,
          bold: true,
          fillColor: '#eeeeee'
        },
        sectionTitle: {
          fontSize: 10,
          bold: true,
          fillColor: '#eeeeee',
          margin: [5, 3, 5, 3]
        }
      }
    };

    const pdf = pdfMake.createPdf(docDefinition);
    const base64: string = await new Promise(ok => pdf.getBase64(ok));
    return { base64, numeroFactura, fecha: fechaStrMail, fileName };
  }
}
