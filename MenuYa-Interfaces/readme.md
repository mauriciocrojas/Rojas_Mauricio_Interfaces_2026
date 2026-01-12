<p align="center">
  <img alt="icon-background" src="https://github.com/user-attachments/assets/cba8f4a4-81e0-4463-83e7-bf06aba442ca" width="200px">
</p>

# MenuYa_2025 – Proyecto PPS 

Aplicación móvil desarrollada con Ionic + Angular en el marco de las Prácticas Profesionales Supervisadas (PPS).  
El proyecto tiene como objetivo diseñar e implementar una app orientada a la gestión integral de un restaurante, garantizando el cumplimiento de los requerimientos funcionales y técnicos establecidos.

---

## Responsabilidades del equipo

### Integrante 1 – Mauricio Rojas
- **Módulos a desarrollar:**

- **Fecha de inicio:** 06/09/2025  
- **Fecha de finalización:** 13/09/2025  

  - Diseño del ícono de la aplicación: creación del logotipo representativo del grupo y la app.
  - Pantalla de Login, Registro, e Inicio: armado del formulario con validaciones, accesos rápidos por perfil y botón de cierre de sesión.
  - Conexión a la BDD
  - Splash Screen estática: diseño con ícono, nombre del grupo (MenuYa) y nombres de todos los integrantes.
  - Splash Screen animada: desarrollo de la versión dinámica respetando los requerimientos.
  - Verificación de borrado de credenciales al cerrar sesión desde el Inicio.


- **Fecha de inicio:** 13/09/2025  
- **Fecha de finalización:** 20/09/2025  

  - Corrección de Splash
  - Botón a módulo Alta de Empleado (Inicio) y Volver (Alta Empleados)
  - Mejoras visuales y funcionales en Login e Inicio


- **Fecha de inicio:** 20/09/2025  
- **Fecha de finalización:** 27/09/2025  

  - Más carga de accesos rápidos desde el Login
  - Accesos a Inicio según perfil
  - Alta de cliente registrado (Alta de DB, Aprobacion/Rechazo + Envío de mail según el caso)
  - Alta de cliente anónimo e ingreso al inicio


- **Fecha de inicio:** 27/09/2025  
- **Fecha de finalización:** 04/10/2025  

  - Carga de maestre al acceso rápido
  - Avance del circuito de: cliente anonimo y cliente registrado, ya pueden escanear el código QR de ingreso (SIMULADO CON BOTÓN).
    para ingresar a la lista de espera y ver encuestas, luego el maistre lo asigna a la mesa (solo puede visualizar los clientes en lista de espera), 
    hecho esto, el cliente puede escanear el código QR de la mesa (SIMULADO CON BOTÓN), para poder ver también la lista de: Menú, juegos, y chat con el mozo.
    Resta implementar módulos de Encuesta, Juegos, Menú.
  - Responsive accesos rápidos del login (+ agregado de mozo al acceso) y lista de aprobaciones por parte del dueño.
  - Módulo de juegos: Ahorcado, Mayor-Menor, y Escape Galáctico implementados.
  - Corrección de lecturas de QR (registro cliente y empleado), ya se completan todos los datos de registro al escanearlo.

- **Fecha de inicio:** 04/10/2025  
- **Fecha de finalización:** 11/10/2025  
  - Módulo de cuenta a solicitar y pagar por el cliente (contempla descuentos y propinas).

- **Fecha de inicio:** 25/10/2025  
- **Fecha de finalización:** 01/11/2025  
  - Flujo de facturación para el Cliente Registrado.
  - Generación de factura en formato PDF que se envía por email al confirmar el pago.

- **Fecha de inicio:** 01/11/2025  
- **Fecha de finalización:** 08/11/2025  
  - Solicitud de Comida a domicilio de parte del cliente registrado, integración de Maps.
  - Mejoras visuales en el Inicio, para que el cliente distinga apartado a Domicilio/En Local.
  - Flujo de facturación para el cliente anónimo en tiempo real cuando el mozo confirma el pago, permitiéndole descargar la factura.
  - Ajuste de descuentos y propina en la facturación.
  - Actualización en tiempo real cuando se confirma el pago en el apartado de cuentas.
  - Generación QR de propinas - Pago de .

  - **Fecha de inicio:** 08/11/2025  
  - **Fecha de finalización:** 15/11/2025  
    - Ajuste de re-cálculo en el monto final considerando descuentos y propinas.
    - Confirmación por dueño/supervisor del pedido a domicilio + estado del pedido para los pedidos a domicilio.
    - Llegada a Cocina y Bartender, y confirmación de preparación del pedido a domicilio.
    - Ajustes de alerts nativos y spinners de carga
    - Actualización en tiempo real asignación mesas Maitre y Estado de los pedidos Clientes 
    - Correcciones de registro

  - **Fecha de inicio:** 15/11/2025  
  - **Fecha de finalización:** 29/11/2025  
    - Ajustes módulo de cuenta para pedidos a domicilio
    - Lista de pagos pendientes y confirmación de pago (por repartidor) - Pedidos a Domicilio
    - Ajustes del visual del estado de pedido a domicilio, tiempo real y listado del dueño
    - Push notification al dueño de pedido a domicilio
    - Agregado rol-token repartidor y push notifications completas para pedidos a domicilio
    - Responsive Login
    - Ajustes chat para pedidos a domicilio
    - Ajustes visuales EstadoMesas y AltaProductos
    - Ajustes visuales listados repartidor
---

### Integrante 2 – Santiago Amato
- **Módulos a desarrollar:**

- **Fecha de inicio:** 06/09/2025  
- **Fecha de finalización:** 13/09/2025  

  - Vibraciones al detectarse un error.
  - Sonidos al iniciar y cerrar la aplicación.
  

- **Fecha de inicio:** 06/09/2025  
- **Fecha de finalización:** 13/09/2025  

  - Módulo de Alta de Empleados


- **Fecha de inicio:** 20/09/2025  
- **Fecha de finalización:** 27/09/2025  

  - Push notification
  - Asignacion de mesas. Rol Maitre  
  - Chat para mozos y clientes


- **Fecha de inicio:** 27/09/2025  
- **Fecha de finalización:** 04/10/2025  

  - Descuentos al ganar un juego  
  - El sector Cocina recibe los pedidos a realizar  
  - El sector bar recibe las bebidas a realizar

 
- **Fecha de inicio:** 04/10/2025  
- **Fecha de finalización:** 11/10/2025  

  - El mozo recibe como pendiente de entrega los productos
  - El cliente recibe el pedido
  - Encuestas
  - Graficos

- **Fecha de inicio:** 11/10/2025  
- **Fecha de finalización:** 18/10/2025  

  - Se saco palabras en ingles
  - Se verifica que no puede tomar una mesa sin estar previamente en la lista de espera.
  - Si estas en la lista de espera, podes ver los resultados de encuestas anteriores
  - Se el input del chat, asi no quedan por fuera las palabras
  - Se verifica que se aplique el desc solo la primera vez q gana, desp ya no(con un popup se le notifica al usuario)


- **Fecha de inicio:** 18/10/2025  
- **Fecha de finalización:** 15/11/2025

  - Push noti, chat, cliente anonimo.
  - Aceleremetro y giroscopio
  - se pasa de foto y/o producto con el movimiento
  - Delivery confirma el pedido
  - chat entre dely y cliente
  - visualizacion del mapa con la ruta
  - el dely entrega el pedido
  - Se repiten los pasos como con el mozo, pero con el deli
  - ingreso atraves de redes sociales(google)


---

### Integrante 3 – Jorge García
- **Módulos a desarrollar:**

- **Fecha de inicio:** 06/09/2025  
- **Fecha de finalización:** 13/09/2025 

  - Se agrega módulo de alta de Bebidas
  - Se agrega módulo de alta de Comidas

- **Fecha de inicio:** 20/09/2025  
- **Fecha de finalización:** 27/09/2025  

  - Se agrega módulo de alta de mesas
  - Se agrega servicio para lectura de QRs 
  - Se agregan QRs de mesas.
  - Escaneo de QRs mesas que permiten al cliente interactuar con el menú, chat y juegos.
  - Se agrega ingreso a la lista de espera por escaneo de QR.

- **Fecha de inicio:** 27/09/2025  
- **Fecha de finalización:** 04/10/2025  

  - Se implementa spinner con el logo de la app.
  - Se agrega menú de comidas y bebidas
  - Mejoras visuales en el alta de mesas, comidas y bebidas. Previsualización de imágenes en el alta.
  - Se implementa la generación de pedidos

- **Fecha de inicio:** 04/10/2025  
- **Fecha de finalización:** 11/10/2025  

  - Actualización del Home de cliente para gestionar pedidos recibidos y mostrar su estado.
  - Mejora en el flujo de aceptación de pedidos de cocina/coctelería
  - Se agrega aprobacion/rechazo del pedido y confirmación del pago de parte del mozo.

- **Fecha de inicio:** 08/11/2025  
- **Fecha de finalización:** 15/11/2025  

  - Generación de QR por cada mesa.
  - Gestión de reservas de parte del dueño.
  - Creación de reservas de los clientes.
  - Ajustes en el diseño del estado de mesas.

- **Fecha de inicio:** 15/11/2025  
- **Fecha de finalización:** 22/11/2025  

  - Ajuste en los estados de pedidos/mesas.
  - Se actualiza el servicio de notificaciones para todos los roles.
  - Fix de bug de notifaciones a los roles que no eran dueños.
  - Ajustes en la creación de tokens para las notificaciones de todos los roles.

- **Fecha de inicio:** 15/11/2025  
- **Fecha de finalización:** 29/11/2025  
  - Push notification a los clientes anónimos para obtener la factura
  - Agregado rol-token anónimo.
  - Se agrega 4to juego con giroscopio.
  - Ajustes en la actualización de las mesas reservadas.
  - Mejora en pantalla de pedidos pendientes.
  - Mejora en lógica de alta de comidas/bebidas: Validación del alta con carta de productos.
  - Se agrega menú para los roles de cocina y barra.
  - Mejora en la aplicación de los descuentos.
  - Aplicación de distintos montons de descuentos según el juego (10%-15%-20%)
  - Actualización en tiempo real cuando se entrega el pedido de cocina/barra.
---

# Imagenes App
<img src="https://github.com/user-attachments/assets/e56736fd-e7f2-48f0-b3bb-46dac3d6a25b" width="220"/>
<img src="https://github.com/user-attachments/assets/d4c6a105-a5a0-4a34-bc39-e7c50d19adbd" width="220"/>
<img src="https://github.com/user-attachments/assets/c2c683f3-76df-49e2-9d21-91c8e56a16af" width="220"/>
<img src="https://github.com/user-attachments/assets/b0b74abc-899c-4000-ae03-d4ec102fdc10" width="220"/>
<img src="https://github.com/user-attachments/assets/8363a85b-68e8-4f4e-860d-60263d43be87" width="220"/>
<img src="https://github.com/user-attachments/assets/7235db3a-5a94-444b-b319-974ced3bc62d" width="220"/>
<img src="https://github.com/user-attachments/assets/81abd538-6a8a-4610-a81e-1292c60ba6eb" width="220"/>
<img src="https://github.com/user-attachments/assets/82e124fe-55f1-41d7-a43b-01639b4d173d" width="220"/>
<img src="https://github.com/user-attachments/assets/bc52a604-1c41-4888-a695-1a25c5d1001c" width="220"/>
<img src="https://github.com/user-attachments/assets/e16a7c78-6e92-486a-b768-19cb875732ae" width="220"/>
<img src="https://github.com/user-attachments/assets/70c2e22f-b414-4f73-a825-8b00109cfb71" width="220"/>
<img src="https://github.com/user-attachments/assets/75729ca9-6dcd-4f02-bd18-e6e59e25eb68" width="220"/>
<img src="https://github.com/user-attachments/assets/42697514-5de3-4249-a2cf-e30bdf2e4f3c" width="220"/>
<img src="https://github.com/user-attachments/assets/03348ce0-ae34-4974-871c-f31902371872" width="220"/>
<img src="https://github.com/user-attachments/assets/8b890099-c1bc-4bce-aed4-09938a847037" width="220"/>
<img src="https://github.com/user-attachments/assets/a1dac836-9342-4cfd-89c6-2854cc30d569" width="220"/>
<img src="https://github.com/user-attachments/assets/f425c2cf-7540-41ac-a424-69825055d13e" width="220"/>
<img src="https://github.com/user-attachments/assets/86e21b32-d2d2-4706-b522-ac5737096af4" width="220"/>
<img src="https://github.com/user-attachments/assets/f03a48f6-fa8d-4e29-ab64-2743ab0adc5d" width="220"/>
<img src="https://github.com/user-attachments/assets/22a55fbc-3da1-4c93-8a22-525bf33e9af1" width="220"/>
<img src="https://github.com/user-attachments/assets/ad5b0b34-03b2-4409-9f96-0bc5f76eec64" width="220"/>
<img src="https://github.com/user-attachments/assets/b38a635f-a42a-4343-8e00-bfcb372e93a2" width="220"/>
<img src="https://github.com/user-attachments/assets/7942573e-c895-4b7a-8b1e-76be3fec8977" width="220"/>
<img src="https://github.com/user-attachments/assets/00a25d54-25fc-422a-97a9-0b332f2c85b8" width="220"/>
<img src="https://github.com/user-attachments/assets/a78249ae-ab25-4e98-8d72-9d0dcdaccaaa" width="220"/>
<img src="https://github.com/user-attachments/assets/05b15a13-1fbf-4860-a41d-2ad9f0df8e61" width="220"/>
<img src="https://github.com/user-attachments/assets/f3922fc0-00b1-4750-b85a-f00b476b934b" width="220"/>
<img src="https://github.com/user-attachments/assets/c8bdcceb-226d-4b4a-83d6-51de79dc0463" width="220"/>
<img src="https://github.com/user-attachments/assets/142758ca-772c-44c3-ac59-b38b53980bd5" width="220"/>
<img src="https://github.com/user-attachments/assets/ac44c431-c5ff-43c0-898f-0126a45d25fe" width="220"/>
<img src="https://github.com/user-attachments/assets/689ab9e4-7420-4084-8bf1-3ca66d087b2c" width="220"/>
<img src="https://github.com/user-attachments/assets/3b214276-5e74-491b-8110-21fc23f24b45" width="220"/>
<img src="https://github.com/user-attachments/assets/0905f204-b35e-4f83-9336-22d3fbe40b27" width="220"/>
<img src="https://github.com/user-attachments/assets/98bc1fbf-4ae4-437c-84b5-c67ec04a898d" width="220"/>
<img src="https://github.com/user-attachments/assets/62520144-70a0-44ad-a71c-3dbddc48b602" width="220"/>
































