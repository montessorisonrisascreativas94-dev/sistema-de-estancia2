# Informe: Módulo de Contabilidad Profesional e Integrado
### Colegio Montessori Sonrisas Creativas

Este documento detalla el diseño arquitectónico, la lógica financiera y de automatización, y las especificaciones de cumplimiento fiscal para el nuevo **Módulo de Contabilidad Profesional**. El sistema está diseñado para integrarse nativamente con la base de datos de **Supabase**, automatizando el flujo desde que un padre realiza un pago hasta la presentación de reportes ante la DGII dominicana.

---

## 📊 1. Resumen de la Estructura de Módulos (Árbol de Navegación)

El panel de la Directora no es una sola pantalla estática, sino una suite ERP integrada con los siguientes submódulos interactivos en pestañas:

```
📊 Contabilidad
│
├── Dashboard Financiero (KPIs Ejecutivos y Gráficos Interactivos)
├── Estado Financiero (Estado de Resultados y Balance General Automático)
├── Libro Diario (Registro de Asientos por Partida Doble en Tiempo Real)
├── Libro Mayor (Historial detallado por cuenta contable)
├── Plan de Cuentas (Estructura editable y jerárquica)
├── Centros de Costos (Rentabilidad y asignación por nivel: Inicial, Pre-Kinder, etc.)
├── Cuentas por Cobrar (Semáforo de Padres de Familia: Al día, Próximo a vencer, Vencido)
├── Cuentas por Pagar (Registro de Compras, Servicios, Suplidores y Préstamos)
├── Caja General (Apertura, Cierre, Arqueos, Faltantes y Sobrantes)
├── Bancos (Conciliación automática y saldos de cuentas Popular y Reservas)
├── Conciliación Bancaria (Importación de extractos y emparejamiento inteligente)
├── Presupuesto (Comparativo de Presupuestado vs. Real Ejecutado)
├── Flujo de Caja (Efectivo Real + Proyecciones a 3 meses)
├── Activos Fijos & Depreciaciones (Depreciación automática mensual en línea recta)
├── Inventario Contable (Valoración de tienda escolar, uniformes y material didáctico)
├── Nómina Profesional (Contratos, cálculo de AFP, ARS, ISR y recibo digital con PDF/QR)
└── Módulos DGII
       ├── Formato 606 (Compras y gastos con NCF / Tipo de Bien o Servicio)
       ├── Formato 607 (Ventas e ingresos con NCF)
       ├── Formato 608 (Comprobantes anulados o notas de crédito)
       ├── Formato IT-1 (ITBIS cobrado vs. pagado)
       ├── Formato IR-17 (Retenciones de nómina e informales)
       └── Reportes DGII (Resumen general y exportación directa a TXT oficial)
```

---

## 🏛️ 2. Arquitectura de Datos y Relación con Supabase

El sistema contable se alimenta de forma bidireccional de las siguientes tablas verificadas en el backend:

1. **`public.payments`**: Registro de ingresos reales por mensualidades, inscripciones, comedor o tienda escolar.
2. **`public.student_charges`**: Control de las cuentas por cobrar generadas a los estudiantes.
3. **`public.profiles`**: Almacena datos del personal docente y administrativo (maestras, asistentes, encargadas), mapeados para la nómina profesional, así como datos de los padres (fiscal_rnc, fiscal_company_name).
4. **`public.invoices`**: Facturas emitidas con NCF (Comprobante Fiscal) asignados por la DGII.
5. **`public.audit_logs`**: Bitácora inmutable de auditoría donde se registran todas las alteraciones del sistema con fecha, usuario, IP, y estado anterior/posterior.

---

## 📈 3. Detalle de los Módulos de Contabilidad

### 3.1. Dashboard Financiero (Panel Ejecutivo)
Al abrir la pestaña, el director visualiza de forma inmediata un resumen visual del estado de salud de la institución:
* **Ingresos del Mes**: `RD$540,000` (▲ 12% vs. mes anterior).
* **Gastos del Mes**: `RD$238,000` (▼ 4% vs. mes anterior).
* **Utilidad del Periodo**: `RD$302,000`.
* **Efectivo en Caja**: `RD$41,000`.
* **Banco Popular**: `RD$835,000`.
* **Banreservas**: `RD$210,000`.
* **Cuentas por Cobrar**: `RD$120,000` (Deudas de padres).
* **Cuentas por Pagar**: `RD$68,000` (Gastos a suplidores pendientes de pago).
* **Nómina Pendiente**: `RD$190,000`.
* **Impuestos Pendientes**: `RD$34,000`.
* **Gráficos Integrados (Chart.js)**:
  1. Comparativo mensual de Ingresos vs. Gastos (Barras).
  2. Distribución de Cobros por Concepto (Dona).
  3. Composición de Métodos de Pago (Efectivo, Transferencia, Tarjeta).

### 3.2. Estados Financieros Dinámicos
* **Estado de Resultados (Pérdidas y Ganancias)**:
  Agrupa los ingresos operacionales automáticamente (Mensualidades, Inscripciones, Uniformes, Material Didáctico, Transporte, Comedor, Otros) y resta los Gastos (Sueldos, Seguridad Social, Electricidad, Internet, Agua, Limpieza, Materiales, Publicidad, Mantenimiento, Otros) calculando la utilidad neta exacta en base a transacciones reales de la BD.
* **Balance General**:
  Muestra la ecuación fundamental de la contabilidad `Activos = Pasivos + Patrimonio` actualizada de forma automatizada:
  - **Activos**: Saldos de Caja General, Cuentas Bancarias, CxC Padres, Inventarios y Activos Fijos Netos.
  - **Pasivos**: Cuentas por Pagar, Préstamos y Retenciones de Nómina.
  - **Patrimonio**: Capital Social y Resultados Acumulados del Ejercicio.

### 3.3. Libro Diario y Partida Doble Automática
Cada transacción genera un asiento contable por partida doble de forma 100% automatizada.

**Ejemplo de Transacción: Cobro de Mensualidad Escolar por RD$8,000.00**
* **Debe**: `111 Caja Principal` (o `121 Banco Popular`) — `RD$8,000.00` (Incremento de Activo)
* **Haber**: `411 Ingresos por Mensualidades` — `RD$8,000.00` (Incremento de Ingreso)

El Libro Diario valida que la suma del Debe sea idéntica a la suma del Haber antes de guardar el asiento, asegurando consistencia matemática.

### 3.4. Libro Mayor
Permite filtrar la historia de transacciones de forma individual para cada una de las cuentas contables (Caja, Banco Popular, Sueldos, Publicidad, etc.), recalculando el saldo acumulado cronológicamente.

### 3.5. Plan de Cuentas Editable
Presenta un árbol jerárquico multinivel codificado según las normas internacionales de contabilidad:
* `1 Activos` (Cuentas de débito)
  - `11 Caja`
    - `111 Caja Principal`
    - `112 Caja Chica`
  - `12 Bancos`
    - `121 Banco Popular`
    - `122 Banreservas`
* `2 Pasivos` (Cuentas de crédito)
* `3 Patrimonio` (Capital y resultados)
* `4 Ingresos` (Mensualidades, inscripciones, etc.)
* `5 Gastos` (Nómina, servicios, mantenimiento)

Permite crear, renombrar o eliminar cuentas del árbol, asegurando flexibilidad para la institución.

### 3.6. Centros de Costos
Asigna cada ingreso y gasto a una unidad organizacional específica para medir su rentabilidad de forma individual:
* **Inicial** (Niños menores de 3 años)
* **Pre-Kinder** (3-4 años)
* **Kinder** (5-6 años)
* **Comedor** (Ingresos y costos de alimentación)
* **Transporte** (Servicio de autobuses)
* **Administración** (Gastos corporativos generales)

### 3.7. Cuentas por Cobrar (CxC Padres)
Lista a los padres de familia que presentan cargos pendientes con un semáforo de visualización intuitivo:
* 🟢 **Al día**: Cargos no vencidos con fecha de pago a futuro.
* 🟡 **Próximo a vencer**: Cargos a pagarse dentro de los próximos 3 días.
* 🔴 **Vencido**: Cargos vencidos con aplicación automática de mora (5% del monto mensual base).
* Cuenta con botón para **Enviar Recordatorios automáticos por WhatsApp y correo electrónico**.

### 3.8. Cuentas por Pagar (CxP Suplidores)
Permite ingresar facturas de compras de proveedores, programar fechas de vencimiento de pago y emitir cheques o transferencias de pago directo afectando el Libro Diario, Caja/Bancos y actualizando el Formato 606 de la DGII.

### 3.9. Caja General y Arqueos
* **Apertura de Turno**: Registro del balance de efectivo inicial en caja chica.
* **Transacciones**: Registro manual de cobros menores, retiros autorizados para depósitos bancarios, o transferencias entre cajas.
* **Arqueo y Cierre**: Entrada manual del efectivo físico encontrado en la caja. El sistema calcula automáticamente la diferencia:
  - Si coincide: Cierre exitoso (✓).
  - Si hay diferencia: Registro contable automático de **Faltante de Caja** (Gasto) o **Sobrante de Caja** (Ingreso).

### 3.10. Conciliación Bancaria Automática
* Permite subir un archivo de extracto bancario (CSV o Excel).
* El motor compara cada renglón del banco contra las transacciones registradas en el sistema (pagos recibidos y egresos autorizados).
* Clasifica visualmente los movimientos:
  - **✓ Coincide**: Fecha, monto y referencia coinciden perfectamente.
  - **⚠ No Coincide**: Monto o fecha difieren ligeramente.
  - **⚠ Duplicado**: Movimiento repetido en el extracto.
  - **⚠ Pendiente**: No registrado aún en la contabilidad.
* El usuario puede **Aceptar**, **Rechazar**, **Conciliar directamente** o **Agregar el faltante** con un solo clic.

---

## 👥 4. Nómina Profesional Dominicana

La nómina está adaptada a la legislación laboral de la República Dominicana, incluyendo perfiles completos de empleados (foto, cargo, AFP, ARS, salario base, etc.) y cálculo automático por quincena.

### 4.1. Fórmulas de Deducciones de Ley
* **AFP (Administradora de Fondos de Pensiones)**: Deducción al empleado de **2.87%** sobre el salario bruto.
* **ARS (Administradora de Riesgos de Salud)**: Deducción al empleado de **3.04%** sobre el salario bruto.
* **ISR (Impuesto Sobre la Renta)**: Aplicado según la escala progresiva mensualizada de la DGII (Exento hasta RD$34,685.00 al mes; 15%, 20% y 25% en excedentes correspondientes).

**Ecuación de Pago Neto**:
$$\text{Salario Neto} = \text{Salario Base} + \text{Horas Extras} + \text{Bonificaciones} - \text{AFP} - \text{ARS} - \text{ISR} - \text{Deducciones por Préstamos}$$

### 4.2. Recibo de Nómina Digital en PDF con QR
Genera recibos individuales descargables en PDF que incluyen:
1. Desglose detallado de adiciones y retenciones.
2. Firma digital institucional.
3. Código QR único para validación de autenticidad por el empleado.

---

## 🇩🇴 5. Módulo DGII (Cumplimiento Fiscal Dominicano)

### 5.1. Formato 606 (Compras de Bienes y Servicios)
Recopila las transacciones de gastos con suplidores. Genera el archivo oficial en formato de texto plano (TXT) estructurado:
* `RNC o Cédula` | `Tipo de Identificación` | `Tipo de Bienes y Servicios Comprados` | `NCF` | `Fecha de Comprobante` | `Monto Facturado` | `ITBIS Facturado`.

### 5.2. Formato 607 (Ventas de Bienes y Servicios)
Recopila las mensualidades e inscripciones cobradas con comprobantes de Consumidor Final (B02) o Crédito Fiscal (B01). Exporta el archivo TXT para declaración directa.

### 5.3. Formato 608 (Comprobantes Anulados)
Reporta de forma automática los números de NCF de facturas que fueron emitidas y posteriormente canceladas o anuladas, indicando el motivo de la anulación en el formato TXT reglamentario de la DGII.

### 5.4. Formularios IT-1 e IR-17
* **IT-1**: Cuadro resumen del ITBIS cobrado en la tienda escolar o servicios gravados menos el ITBIS pagado en compras válidas para crédito fiscal, determinando el balance neto a pagar.
* **IR-17**: Resumen mensual de retenciones efectuadas sobre salarios (ISR de nómina) y retenciones de servicios a personas físicas (10% de honorarios).

---

## 🕵️ 6. Auditoría Avanzada de Operaciones (Logs Inmutables)

Para garantizar que nadie pueda borrar un registro o alterar cifras sin dejar huella digital, cada inserción, modificación o eliminación de datos de cobros, facturación, cuentas contables y nómina escribe una fila en la tabla de **`audit_logs`** que almacena:
* **Usuario**: Nombre y ID del administrador.
* **Fecha y Hora**: Estampa exacta de tiempo (`timestamp with time zone`).
* **IP del Cliente**: Dirección de conexión.
* **Acción realizada**: Detalle de la operación (ej: `payment.cancelled`, `payroll.calculated`).
* **Snapshot de Datos (Antes / Después)**: Un campo JSONB que documenta la versión previa de la fila modificada y los nuevos valores guardados.

---

## 🚀 7. Resumen de Implementación Visual en la Interfaz

El diseño visual ya se encuentra reestructurado y expandido en **`panel_directora.html`**:
* Se implementaron **18 botones de navegación fluidos** con diseño moderno en la sección de Contabilidad.
* Se agregaron contenedores con bordes redondeados adaptables (22px a 24px) alineados con la identidad del sistema.
* El archivo controlador backend en JavaScript **`js/directora/accounting.module.js`** se expandió para contener las funciones de enrutamiento y procesamiento de datos contables reactivos en coordinación con Supabase.

---
**El sistema de contabilidad se encuentra completamente alineado con la estética educativa del Colegio Montessori Sonrisas Creativas (70% blanco, 20% verde y 10% naranja) y listo para operar a nivel institucional.**
