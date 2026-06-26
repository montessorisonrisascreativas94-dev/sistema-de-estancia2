# 🎨 Documentación del Nuevo Diseño - Colegio Montessori Sonrisas Creativas

---

## 📋 Tabla de Contenidos
1. [Visión General](#-visión-general)
2. [Estructura de Archivos](#-estructura-de-archivos)
3. [Tecnologías Utilizadas](#-tecnologías-utilizadas)
4. [Paleta de Colores](#-paleta-de-colores)
5. [Tipografías](#-tipografías)
6. [Componentes Principales](#-componentes-principales)
7. [Animaciones](#-animaciones)
8. [Mascotas SVG](#-mascotas-svg)
9. [Cómo Probar](#-cómo-probar)

---

## 🌟 Visión General

Este diseño está inspirado en la filosofía Montessori, con un estilo **artístico, juguetón y profesional**. Se utilizan formas orgánicas, brochazos de pintura, y mascotas animadas que dan vida al sitio web.

### Características principales:
- ✅ Navbar con efecto glassmorphism
- ✅ Hero con mancha de pintura y sol sonriente
- ✅ Mascotas SVG animadas (Triángulo Naranja y Hexágono Verde)
- ✅ Separadores de sección en forma de ola (nunca líneas rectas!)
- ✅ Tarjetas con efecto de papel pegado
- ✅ Confeti al hacer scroll
- ✅ Animaciones suaves y naturales
- ✅ Diseño 100% responsive
- ✅ Subrayados de títulos con efecto de pincel

---

## 📁 Estructura de Archivos

```
sistema-de-estancia2-main/
├── index-new.html              # Página principal NUEVA
├── login.html                  # (se puede actualizar después)
├── css/
│   ├── style-new.css           # Estilos principales (nuevo)
│   ├── animations.css          # Animaciones (nuevo)
│   └── ... (otros CSS antiguos)
├── js/
│   ├── main-new.js             # JavaScript principal (nuevo)
│   ├── components.js           # Componentes reutilizables (nuevo)
│   └── ... (otros JS antiguos)
└── img/
    ├── image.png               # Tu imagen de referencia
    └── ... (otras imágenes)
```

---

## 🚀 Tecnologías Utilizadas

### 1. **HTML5 Semántico**
- `<header>`, `<nav>`, `<section>`, `<footer>`, etc.
- Buenas prácticas de accesibilidad

### 2. **Tailwind CSS CDN**
- Utilidad-first CSS
- Configuración customizada para colores y fuentes
- No requiere instalación, funciona directamente desde el CDN

### 3. **CSS3 Animations**
- Animaciones con `@keyframes`
- Transiciones suaves
- Transformaciones 2D

### 4. **SVG (Scalable Vector Graphics)**
- Mascotas creadas como SVG
- 100% escalables sin pérdida de calidad
- Animables directamente con CSS

### 5. **JavaScript Vanilla (ES6+)**
- Sin dependencias externas
- Intersection Observer API para animaciones al hacer scroll
- Funciones reutilizables

### 6. **Bootstrap Icons**
- Librería de íconos gratuita y moderna
- Fácil de usar

---

## 🎨 Paleta de Colores

| Color | Código HEX | Uso |
|-------|-----------|-----|
| **Azul Institucional** | `#1E5AA8` | Navbar, títulos, botones secundarios, sombrero del hexágono |
| **Naranja** | `#F7931E` | Botones principales, triángulo, detalles |
| **Verde** | `#43A047` | Hexágono, tarjetas, fondos |
| **Amarillo** | `#FFD54F` | Sol, íconos, acentos, checks |
| **Blanco** | `#FFFFFF` | Fondo principal, tarjetas |
| **Beige** | `#FFF8ED` | Fondos secundarios, ambiente cálido |

---

## 🔤 Tipografías

Se utilizan **tres fuentes** de Google Fonts:

### 1. **Poppins** (Principal)
- Títulos grandes y destacados
- Peso: 400, 600, 700, 800
- Uso: Hero, títulos de sección

### 2. **Nunito** (Secundaria)
- Texto de párrafos
- Peso: 400, 600, 700
- Uso: Contenido, descripciones

### 3. **Quicksand** (Decorativa)
- Logo y elementos destacados
- Peso: 400, 500, 600, 700
- Uso: Nombre del colegio, botones

---

## 🧩 Componentes Principales

### 1. Navbar Glassmorphism
```html
<nav class="navbar fixed top-0 left-0 right-0 z-50 py-4 px-6">
```
- **Transparente** al principio
- **Fondo semi-transparente + blur** al hacer scroll
- Mini-mascotas animadas en el logo
- Botón de acceso padres con naranja

### 2. Hero Section
- Fondo con brochazos SVG (azul, verde, amarillo)
- Título con colores alternados
- Mancha de pintura con foto (forma irregular)
- Sol sonriente animado
- Mascotas: Triángulo con pincel + Hexágono saludando
- Botones con sombra y efecto hover

### 3. Wave Dividers
```html
<div class="wave-divider">
    <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path d="..." fill="white"/>
    </svg>
</div>
```
- Separadores entre secciones
- **Nunca líneas rectas!**
- Formas organicas de ola

### 4. Program Cards
```html
<div class="program-card bg-white rounded-3xl overflow-hidden shadow-lg">
```
- Fondo con degradado
- Ícono emoji grande
- Rotación sutil (±1°)
- Efecto hover: levanta y quita rotación
- Sombra suave

### 5. Testimonial Cards
```html
<div class="testimonial-card bg-white rounded-3xl p-8 shadow-xl border-4">
```
- Comilla gigante (") en color amarillo
- Borde de color diferente por tarjeta (naranja, verde, azul)
- "Cinta" de papel en la parte superior
- Foto circular con inicial del nombre
- Calificación con estrellas

### 6. Contact Section
- Mapa dentro de marco con bordes coloridos
- Íconos gigantes con fondos de degradado
- WhatsApp, Instagram, Dirección, Horario

### 7. Footer
- Fondo azul oscuro
- Ola separadora en la parte superior
- Mascotas despidiéndose
- Sol sonriente en el centro
- Redes sociales
- Links rápidos

---

## ✨ Animaciones

### Mascotas
| Animación | Descripción |
|-----------|-------------|
| `triangleBounce` | Rebote suave del triángulo |
| `hexagonWave` | Balanceo del hexágono |
| `triangleBlink` | Parpadeo de ojos (cada 4 seg) |
| `hexagonBlink` | Parpadeo de ojos (cada 5 seg) |
| `armWave` | Movimiento del brazo que saluda |
| `sunBounce` | Rebote y rotación del sol |
| `sunRays` | Brillo de los rayos del sol |

### Elementos Decorativos
| Animación | Descripción |
|-----------|-------------|
| `float` | Flotar arriba y abajo |
| `twinkle` | Brillo de estrellas |
| `pulse` | Latido de corazones |

### Secciones
| Animación | Descripción |
|-----------|-------------|
| `blobWobble` | Deformación de la mancha de pintura |
| `fadeInUp` | Aparición desde abajo al hacer scroll |
| `brushMove` | Movimiento sutil de los brochazos de fondo |

### Botones
| Animación | Descripción |
|-----------|-------------|
| Elevación | Se levanta 4px al hacer hover |
| Sombra | Sombra más intensa al hacer hover |
| Escala | Aumenta ligeramente de tamaño (1.02x) |

---

## 🎭 Mascotas SVG

### 1. Triángulo Naranja 🟠
```svg
<polygon points="90,20 165,180 15,180" fill="#F7931E"/>
```
- **Características**:
  - Triángulo equilátero
  - Ojos grandes con brillo
  - Sonrisa curva
  - Brazos simples
  - **Sostiene un pincel!** 🖌️

- **Animaciones**:
  - Rebote constantemente
  - Parpadea cada 4 segundos
  - Respira suavemente

### 2. Hexágono Verde 🟢
```svg
<polygon points="90,10 155,45 155,105 90,140 25,105 25,45" fill="#43A047"/>
```
- **Características**:
  - Hexágono regular
  - **Sombrero azul** (#1E5AA8)
  - Ojos grandes con brillo
  - Sonrisa
  - **Brazo que saluda!** 👋

- **Animaciones**:
  - Balanceo suave
  - Parpadea cada 5 segundos
  - Brazo se mueve constantemente

### 3. Sol Sonriente ☀️
```svg
<circle cx="60" cy="60" r="50" fill="#FFD54F"/>
```
- **Características**:
  - Círculo amarillo
  - Ojos y sonrisa
  - 8 rayos alrededor

- **Animaciones**:
  - Rebota suavemente
  - Rayos brillan

---

## 🎯 Cómo Probar

### Paso 1: Abrir el archivo
1. Ve a la carpeta del proyecto
2. Abre `index-new.html` en tu navegador (Chrome, Firefox, Edge, Safari)

### Paso 2: Probar funcionalidades
1. **Scroll hacia abajo**:
   - Navbar se vuelve blanca con blur
   - Aparece confeti
   - Tarjetas se animan al entrar en vista

2. **Hover en botones**:
   - Se levantan
   - Sombra se intensifica
   - Mascotas reaccionan!

3. **Redimensionar ventana**:
   - Verifica el responsive design
   - Mobile, tablet, desktop

4. **Click en enlaces**:
   - Smooth scroll a las secciones

### Paso 3: Si quieres reemplazar el index original
1. Haz una copia de seguridad de `index.html` (renómbralo a `index-old.html`)
2. Renombra `index-new.html` a `index.html`

---

## 📱 Responsive Design

El diseño funciona perfectamente en:

| Dispositivo | Ancho | Características |
|-------------|-------|------------------|
| **Desktop** | > 1024px | Layout completo |
| **Tablet** | 768px - 1024px | Grid ajustado, textos más pequeños |
| **Mobile** | < 768px | Una columna, botones más grandes, mascotas reducidas |
| **Mobile Pequeño** | < 480px | Optimizaciones adicionales |

---

## 🔧 Personalizaciones Fáciles

### Cambiar una imagen
Busca la etiqueta `<img>` y cambia el atributo `src`:
```html
<img src="img/tu-imagen.jpg" alt="...">
```

### Cambiar colores
Edita las variables CSS en `style-new.css`:
```css
:root {
    --blue: #1E5AA8;      /* Cambia el azul */
    --orange: #F7931E;    /* Cambia el naranja */
    --green: #43A047;     /* Cambia el verde */
    --yellow: #FFD54F;    /* Cambia el amarillo */
}
```

### Ajustar velocidad de animaciones
En `animations.css`, modifica los valores de tiempo:
```css
animation: blobWobble 8s ease-in-out infinite;
/*                         ↑ Cambia esto */
```

---

## ✅ Checklist de Características

- [x] Navbar glassmorphism con efecto scroll
- [x] Hero con brochazos de colores
- [x] Sol sonriente animado
- [x] Mascota triángulo naranja con pincel
- [x] Mascota hexágono verde con sombrero
- [x] Mancha de pintura con foto
- [x] Separadores de ola (nunca líneas rectas!)
- [x] Tarjetas con efecto de papel
- [x] Tarjetas rotadas sutilmente
- [x] Subrayados de pincel en títulos
- [x] Animaciones de scroll con Intersection Observer
- [x] Confeti al hacer scroll
- [x] Botones con efecto gel
- [x] Testimonios con comillas gigantes
- [x] Galería con fotos Polaroid (opcional)
- [x] Mapa con marco decorativo
- [x] Footer con mascotas despidiéndose
- [x] Botones flotantes (WhatsApp + Instagram)
- [x] 100% Responsive
- [x] Accesibilidad básica
- [x] Smooth scroll

---

## 📞 Contacto y Soporte

Si necesitas ayuda o quieres modificar algo:
1. Revisa este documento
2. Mira los comentarios en el código
3. Prueba los cambios en `index-new.html` primero antes de reemplazar el original

---

## 🎉 ¡Listo para usar!

El diseño está **completo y funcional**. Abre `index-new.html` y disfruta de tu nueva página web de Colegio Montessori Sonrisas Creativas! ✨

---

*Documentación creada con ❤️ para Sonrisas Creativas*