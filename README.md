# 📚 Kindle Notes Organizer

Software ligero, privado y 100% local para extraer, depurar, estructurar por capítulos y exportar tus resaltados y notas de Kindle (`My Clippings.txt` + libros `.epub`) en documentos independientes por libro en formatos **Word (`.docx`)**, **Markdown (`.md`)** y **PDF (`.pdf`)**.

---

## 🔒 Arquitectura de Seguridad (Zero-Node / Sin Dependencias de Terceros)

Este proyecto fue diseñado bajo principios estrictos de seguridad y aislamiento:
* **0 dependencias de Node.js / `node_modules`:** No instala ni ejecuta paquetes de terceros desde `npm`, eliminando por completo la exposición a vulnerabilidades de cadena de suministro (*supply-chain attacks*) o brechas de ejecución en servidores Node.js.
* **Ejecución 100% en el Sandbox del Navegador:** Todo el procesamiento de tus libros y notas ocurre en la memoria local de tu navegador.
* **Política `Content-Security-Policy` estricta (`connect-src 'none'`):** El navegador bloquea por diseño cualquier intento de conexión hacia internet o envío de telemetría.

---

## 💻 ¿Cómo usarlo en varios PCs (Casa y Oficina)?

### Opción A: En tu PC de Oficina (Sin permisos de administrador ni instalación)
1. Abre directamente el archivo **[`KindleNotesOrganizer-Portable.html`](./KindleNotesOrganizer-Portable.html)** haciendo doble clic sobre él (se abrirá en Chrome, Edge o tu navegador predeterminado).
   * *Tip:* Puedes guardar `KindleNotesOrganizer-Portable.html` en tu OneDrive/Google Drive o incluso **dentro de la memoria USB de tu propio Kindle** para tener el programa siempre contigo en cualquier computador donde conectes el Kindle.
2. En el **Paso 1**, haz clic en **`🔌 Elegir Unidad / Carpeta Kindle`** (y selecciona la carpeta `documents` de tu Kindle) o en **`📄 Cargar My Clippings.txt`**.
3. En el **Paso 2**, selecciona tu carpeta de destino para que el programa detecte si ya tenías exportaciones previas y te indique qué libros son **Nuevos** o tienen **Notas nuevas**.
4. En el **Paso 3**, elige tus formatos (`.docx`, `.md`, `.pdf`) y haz clic en **`🚀 Exportar Libros Seleccionados`**.

### Opción B: En tu PC de Casa (Detección automática de USB Kindle)
1. Conecta tu Kindle por USB.
2. Haz doble clic en **`Iniciar-Kindle-Organizer.bat`**.
3. El script detectará automáticamente en qué letra de unidad se conectó tu Kindle, actualizará tu `My Clippings.txt` y abrirá la aplicación en tu navegador.

---

## ✨ Características Principales

* **Motor Anti-Duplicados en 3 Niveles:**
  1. Elimina resaltados duplicados exactos.
  2. Detecta cuando ajustaste o redimensionaste un resaltado en el Kindle (solapamiento de posición y texto) y conserva tu corrección final.
  3. Depura notas personales editadas en la misma posición (conservando la última versión corregida).
  4. Incluye una pestaña de **Auditoría de Duplicados Eliminados** para consultar qué versiones intermedias se filtraron en cada libro.
* **Vinculación Inteligente `Resaltado + Mi Nota`:** Une automáticamente cada nota personal con el pasaje exacto al que hace referencia, mostrándola como un bloque de comentario destacado debajo de la cita.
* **Organización por Capítulos Reales (`.epub`) y Secciones:**
  * Lector nativo de archivos `.epub` en el navegador que extrae la Tabla de Contenidos (*TOC*) y ubica cada resaltado en su capítulo correspondiente.
  * Detección automática de encabezados resaltados o agrupación por bloques de páginas cuando no se dispone del archivo `.epub`.
* **Detección de Exportaciones Previas en Destino:**
  * Escanea la carpeta de salida elegida (y mantiene un manifiesto `.kindle-sync.json`) para clasificar tus libros en **🆕 Nuevos**, **🔄 Actualizados (`+X notas nuevas`)** y **✅ Al día**, permitiéndote elegir si deseas reemplazar los archivos previos, conservar ambos con fecha u omitir los existentes.
* **Resumen de Estudio y Etiquetas Automáticas:**
  * Identifica automáticamente tus notas con preguntas (`❓ Duda / Pregunta`), enlaces o bibliografía (`🔗 Referencia`), ideas (`💡 Idea Clave`) y etiquetas `#hashtag`, generando un resumen ejecutivo opcional al inicio de cada documento.
* **Marcadores (*Bookmarks*) Opcionales:** Desactivados por defecto para no ensuciar la lectura, con opción de incluirlos ordenadamente en un apéndice al final del documento.
