// src/types/pdfmake.d.ts

declare module 'pdfmake/build/pdfmake' {
  // Firma mínima suficiente para tu uso
  const pdfMake: any;
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts' {
  // El build expone un objeto con { vfs }
  const pdfFonts: { vfs: any };
  export default pdfFonts;
}
