# Entreno · Planificación deportiva

App web (instalable en el móvil) para que un entrenador planifique las sesiones de sus atletas y vea cuánto han cumplido.

- **Entrenador:** ve una tarjeta por atleta. Al pulsarla se abre su ficha, con tres pestañas:
  - **Sesiones:** diseña las sesiones de ese atleta (título, ejercicios, series, repeticiones, kilos, kilómetros y zona de intensidad, descansos e indicaciones). Se pueden duplicar o copiar a otro atleta.
  - **Planificación:** calendario mensual. Pulsando un día se añaden una o varias de las sesiones diseñadas (y se pueden repetir varias semanas). Cada sesión aparece en el día con un color según lo que ha cumplido el atleta; al pulsarla se ve serie a serie lo pautado frente a lo realizado.
  - **Evolución:** las mismas gráficas que ve el atleta.
- **Atleta:** tres pestañas:
  - **Calendario** (se abre al entrar): vista mensual con toda su preparación. Arriba, acceso directo a la sesión de hoy y a las que tenga sin registrar de la semana. Pulsando una sesión ve los ejercicios y anota lo que ha hecho (si una serie la ha hecho tal cual, basta con pulsar ✓).
  - **Microciclo:** la semana en horizontal, un día por tarjeta, con el título de cada sesión, la lista de sus ejercicios y su estado. En el móvil se desliza de lado y empieza en el día de hoy.
  - **Evolución:** cuatro tarjetas cuadradas con una gráfica pequeña y un resumen (por ejemplo «Peso 76,5 kg (−2,5 %)»): peso corporal, volumen de entrenamiento por grupo muscular, kilómetros según su intensidad (zonas Z1–Z5) y suma de 6 pliegues cutáneos. Al pulsar una tarjeta se abre el detalle: gráfica completa, tabla de datos y, en peso y pliegues, la lista de mediciones para editarlas. El atleta y el entrenador pueden añadir mediciones de peso y pliegues.
    - En peso y pliegues, el porcentaje compara la última medición con la primera del periodo elegido. En volumen y kilómetros, la última semana completa con la anterior.
- **Cada ejercicio lleva una ilustración animada** que muestra el movimiento, además de los pasos para hacerlo y los errores a evitar. Hay 24 ejercicios de serie (incluida la carrera, que se mide en kilómetros y zona) y el entrenador puede crear los suyos (reutilizando un dibujo, con una foto o con un enlace a vídeo).

Si se edita una sesión diseñada, se actualizan también los días en que estaba programada y que el atleta aún no ha registrado. Las ya registradas no cambian.

Funciona entera en **GitHub Pages**: no hace falta servidor ni base de datos. Los datos se guardan **cifrados** en el propio repositorio.

## Cómo se calcula el cumplimiento

Cada serie pautada vale de 0 a 100 %:

- Repeticiones: hechas ÷ pautadas (máximo 100 %).
- Kilos (si se pautaron): usados ÷ pautados (máximo 100 %).
- Se multiplican: 10 repeticiones de 10 con 60 de 60 kg = 100 %; 7 de 10 con 60 kg = 70 %; 10 de 10 con 50 de 60 kg = 83 %.

- Carrera: kilómetros hechos ÷ pautados (máximo 100 %).

El cumplimiento de la sesión es la media de sus series. El del atleta, la media de las sesiones de las últimas 4 semanas que ya han pasado (una sesión vencida sin registrar cuenta como 0 %).

## Publicarla (una sola vez)

1. Este repositorio tiene que ser **público** para usar GitHub Pages gratis (los datos van cifrados).
2. En GitHub: **Settings → Pages**, «Branch» `main` y carpeta `/ (root)`, y **Save**.
3. En uno o dos minutos la app estará en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

## Primeros pasos

1. Abre la app y pulsa **«Crear cuenta de entrenador»**. Al principio todo se guarda solo en ese dispositivo (modo prueba): sirve para probarla.
2. Para que los atletas entren desde su móvil, conéctala con GitHub en **Ajustes → Conexión con GitHub**:
   - Crea una clave en GitHub: tu foto → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - **Repository access:** «Only select repositories» y elige este repositorio.
   - **Permissions → Contents:** «Read and write». Nada más.
   - Pégala en Ajustes y pulsa **«Comprobar y activar»**. Tus datos se suben al repositorio (carpeta `data/`).
3. Da de alta a cada atleta (**Atletas → Añadir atleta**) y envíale el usuario y la contraseña que aparecen (botón «Copiar»).
4. En su ficha, diseña sus sesiones (**Sesiones → Diseñar sesión**) y colócalas en el calendario (**Planificación**).

Cada cambio queda guardado como un commit en el repositorio, así que el historial de Git sirve también de copia de seguridad. En **Ajustes** puedes además descargar una copia de todo.

## Sin cobertura

Una vez abierta con conexión, la app se abre sin internet. Si el atleta registra sin cobertura, lo guarda en el móvil y lo envía solo al recuperar la conexión.

## Seguridad: qué protege y qué no

- Cada atleta tiene su propio fichero cifrado (AES-256-GCM) con una clave que solo se abre con su contraseña (PBKDF2-SHA256). Un atleta no puede leer los datos de otro.
- El entrenador guarda la clave de cada atleta dentro de su propio fichero cifrado: puede ver y planificar a todos sin conocer sus contraseñas, y darles una nueva si la olvidan.
- Si el entrenador olvida su contraseña, no se pueden recuperar los datos.
- La clave de GitHub viaja cifrada dentro del fichero de cada atleta (su app la necesita para guardar). Alguien con usuario de atleta y conocimientos técnicos podría extraerla: solo da acceso a este repositorio, y el historial de Git permite deshacer cualquier cambio. Si sospechas que se ha filtrado, bórrala en GitHub, crea otra y pégala en Ajustes.
- Todo se comprueba en el navegador: es adecuada para planificación deportiva, no para datos de alto riesgo.

## Estructura

```
index.html            La app (entrenador y atleta)
js/app.js             Pantallas
js/datos.js           Ficheros cifrados, sincronización, cola sin conexión y cálculo del cumplimiento
js/figuras.js         Ilustraciones animadas y catálogo de ejercicios (pasos y claves)
js/graficas.js        Gráficas de evolución (SVG, sin librerías)
js/cripto.js          Cifrado
js/github.js          Lectura y escritura en el repositorio (API de GitHub)
js/util.js            Utilidades de interfaz
css/estilos.css       Estilos
data/                 Datos cifrados (los crea la app)
sw.js, manifest.webmanifest   Uso sin conexión e instalación en el móvil
```

### Añadir ejercicios al catálogo

En `js/figuras.js`, cada ejercicio define dos o más posturas de una figura vista de lado; la animación pasa de una a otra. Las posturas se describen con la posición de la cadera, el ángulo del tronco y la posición de manos y tobillos (las rodillas y los codos se calculan solos).
