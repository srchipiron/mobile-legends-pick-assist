package es.srchipiron.lector

import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.time.Instant

/**
 * Lo que se enseña de la tablet sin ordenador (no hay logcat): los fallos
 * desde la última vez que tocaste «Ya está», y la cuenta de datos y partidas
 * que da el lector en `/estado`.
 */
object Fallos {
    /**
     * El cierre que apunta Android, la excepción de la app (fallo.txt), la de
     * empezar a grabar (fallo-grabar.txt) y si Node se paró o falló; con la
     * versión, el aparato y lo último del registro, listo para «Copiar».
     * null si nada.
     */
    fun sinVer(contexto: Context): String? {
        val visto = contexto.getSharedPreferences("lector", Context.MODE_PRIVATE).getLong("fallosVistos", 0)
        fun fichero(n: String) = File(contexto.filesDir, n).takeIf { it.exists() && it.lastModified() > visto }?.readText()?.trim()
        val partes = listOfNotNull(
            Salidas.falloDesde(contexto, visto)?.let { "Android: $it" },
            fichero("salida-nodo.txt"),
            fichero("fallo-nodo.txt")?.let { "En el lector:\n$it" },
            fichero("fallo-grabar.txt")?.let { "Al empezar a grabar:\n$it" },
            fichero("fallo.txt")?.let { "En la app:\n$it" },
        )
        if (partes.isEmpty()) return null
        val version = try { contexto.packageManager.getPackageInfo(contexto.packageName, 0).versionName } catch (e: Exception) { "?" }
        // Y lo último del registro del lector: ahí está lo que pasó justo antes.
        val log = Nodo.registro(contexto).takeIf { it.exists() }?.readLines()?.takeLast(40)?.joinToString("\n")
        return (listOf("Lector MLBB $version · Android ${Build.VERSION.SDK_INT} · ${Build.MANUFACTURER} ${Build.MODEL}") + partes + listOfNotNull(log?.let { "Últimas líneas del lector:\n$it" })).joinToString("\n\n")
    }

    /** De cuándo son los datos con los que decide y si tus partidas llegan a la base de datos (`/estado`). */
    fun textoDeCuenta(e: JSONObject): String {
        val lineas = mutableListOf<String>()
        e.optJSONObject("datos")?.let { d ->
            val t = try { Instant.parse(d.optString("fecha", "")).toEpochMilli() } catch (x: Exception) { null }
            if (t != null) {
                val horas = (System.currentTimeMillis() - t) / 3_600_000
                lineas += "Datos del juego de hace ${if (horas < 48) "$horas h" else "${horas / 24} días"}${if (d.optString("de") == "apk") " (los que trae la app: no consigo bajar los nuevos)" else ""}." + if (horas >= 72) " Son viejos: conecta la tablet a internet." else ""
            }
        }
        e.optJSONObject("partidas")?.let { p ->
            val apuntadas = p.optInt("apuntadas")
            val sinSubir = p.optInt("sinSubir")
            lineas += when {
                apuntadas == 0 -> "Aún no ha apuntado ninguna partida."
                sinSubir == 0 && p.optString("deQuien") == "lector" -> "$apuntadas partidas apuntadas, todas guardadas en la base de datos con la clave de esta tablet (cuentan para medir; no salen en Pick Assist del móvil)."
                sinSubir == 0 -> "$apuntadas partidas apuntadas, todas guardadas en tu base de datos."
                !p.optBoolean("clave") -> "$apuntadas partidas apuntadas; $sinSubir solo están en esta tablet: falta tu clave. Abre Pick Assist en el móvil con «Guardar mis partidas» puesto y la tablet vinculada, una vez."
                else -> "$apuntadas partidas apuntadas; $sinSubir por subir (se reintenta sola)."
            }
        }
        return lineas.joinToString("\n")
    }
}
