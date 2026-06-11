# 🏆 Reglas Oficiales - Quiniela RIA - Strategics 2026

¡Bienvenidos a la **Quiniela RIA - Strategics 2026**! Este documento contiene el reglamento oficial del juego para garantizar una competencia justa, transparente y divertida entre todos los compañeros de la oficina durante la Copa del Mundo 2026.

---

## 📋 1. Registro de Participantes
1. Todo jugador debe registrarse con su nombre o apodo único en la sección de **Pronósticos**.
2. No se permiten nombres duplicados.
3. Una vez registrado el jugador, su nombre aparecerá en la tabla general de **Clasificación**.

---

## ⚽ 2. Ingreso de Pronósticos
1. Cada participante debe ingresar su marcador pronosticado (Goles Equipo 1 y Goles Equipo 2) para cada partido.
2. Los cambios e ingresos de marcadores se **auto-guardan instantáneamente** en el navegador del organizador.
3. **Fecha límite de ingreso**: Los pronósticos deben quedar registrados y guardados antes de la hora oficial de inicio de cada partido. Una vez comenzado el encuentro, no se admitirán modificaciones.

---

## 📊 3. Sistema de Puntuación
La puntuación de cada jugador se calcula automáticamente para cada partido finalizado mediante tres categorías acumulativas:

### A. Marcador Exacto (+3 Puntos + 1 Punto de Ganador = 4 Puntos en total)
- Se otorga cuando el jugador acierta el marcador exacto del partido.
- Al acertar el marcador exacto, también se suma el punto por acierto de ganador de forma acumulativa.
- *Ejemplo*: Predice **2 - 1** y el resultado real es **2 - 1** (recibe 3 pts por marcador exacto + 1 pt por acierto de ganador = 4 pts).

### B. Acierto de Ganador o Empate (+1 Punto)
- Se otorga cuando el jugador acierta qué selección gana el partido o si hay un empate, pero no los goles exactos.
- *Ejemplo 1 (Ganador)*: Predice **1 - 0** y el resultado real es **3 - 1** (ambos son victorias locales).
- *Ejemplo 2 (Empate)*: Predice **1 - 1** y el resultado real es **2 - 2** (ambos son empates).

### C. Consuelo por Cercanía (+1 Punto)
- Se otorga al jugador (o jugadores) cuyo pronóstico estuvo **más cerca** del marcador real en número total de goles de entre todos los participantes que **no** acertaron el marcador exacto.
- Se calcula sumando la diferencia absoluta de goles: `Diferencia = |Goles Pred1 - Goles Real1| + |Goles Pred2 - Goles Real2|`.
- *Ejemplo*: Si el marcador real es **2 - 1**:
  - Carlos predice **2 - 1** (Exacto $\rightarrow$ **3 puntos**, no participa en el consuelo).
  - Sofía predice **1 - 0** (Diferencia de **2 goles** $\rightarrow$ Acierta ganador $\rightarrow$ **1 punto**).
  - Diego predice **2 - 0** (Diferencia de **1 gol** $\rightarrow$ Acierta ganador $\rightarrow$ **1 punto** + Consuelo por cercanía $\rightarrow$ **1 punto**). Total de Diego: **2 puntos**.

### D. Acierto de Campeón del Mundo (+10 Puntos)
- Se otorga al finalizar el torneo a todo jugador que haya pronosticado correctamente al campeón oficial de la Copa del Mundo 2026.
- Esta predicción es de carácter público y cada participante puede definir o cambiar su voto libremente desde la pestaña **Votar Campeón**.

*Nota: Los puntos de las reglas son configurables en el panel de Ajustes si el grupo decide cambiarlos.*

---

## 🛠️ 4. Roles y Seguridad (Modo Administrador vs Usuario)
Para evitar modificaciones accidentales o de usuarios no autorizados, el sistema maneja dos tipos de acceso:

1. **Acceso Administrador (Organizador)**:
   - Protegido mediante un **PIN de seguridad** (PIN por defecto: **1234**).
   - Se activa pulsando el botón **"Acceso Admin"** con candado en la barra superior de la pantalla.
   - Otorga permisos exclusivos para:
     * Registrar y eliminar jugadores en la sección de **Pronósticos**.
     * Registrar e ingresar pronósticos de marcadores para los jugadores.
     * Registrar goles reales y finalizar partidos en la pestaña **Admin Resultados**.
     * Modificar las reglas de puntos del torneo.
     * Cambiar el PIN de seguridad desde Ajustes.
     * Ejecutar acciones de reinicio (limpiar marcadores reales o borrar todos los datos).
2. **Modo Usuario (Visualizadores)**:
   - Los usuarios normales tienen acceso en modo de **solo lectura** para la mayoría de las secciones. Pueden navegar por la tabla general, ver el cronograma con banderas, leer las reglas y descargar los reportes de Excel o respaldos.
   - **Excepción pública**: Cualquier usuario puede definir y cambiar libremente su predicción de campeón en la pestaña **Votar Campeón** sin requerir PIN de administrador.
   - No se permite registrar jugadores, ingresar pronósticos de partidos, configurar puntos o ingresar marcadores reales a menos que se inicie sesión como Administrador.

---

## 📥 5. Descarga y Respaldos
1. **Excel General**: Cualquier usuario puede descargar el reporte de Excel `.xlsx` que contiene:
   - Tabla de posiciones actualizada.
   - Calendario completo con resultados reales.
   - Una **Matriz Comparativa** que muestra los pronósticos de todos los jugadores de la oficina organizados en columnas al lado de cada partido para auditar resultados.
2. **Respaldo JSON**: Aunque los datos se guardan de forma centralizada y segura en la base de datos del hosting cPanel, el administrador puede descargar un respaldo en formato JSON como medida de seguridad adicional o para migrar la información si es necesario.
