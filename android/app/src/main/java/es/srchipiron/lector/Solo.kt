package es.srchipiron.lector

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * «Sin móvil»: la línea elegida se guarda en `solo.json`, en la casa de la
 * app, y el lector (scripts/lector/solo.mjs) la lee en cada vuelta, sin
 * reiniciar nada. Sin línea elegida aquí, vale la del móvil; «Apagado» manda.
 */
object Solo {
    val LINEAS = listOf("roam" to "Roam", "jungle" to "Jungla", "mid" to "Mid", "gold" to "Oro", "exp" to "Exp")
    fun nombre(clave: String) = LINEAS.firstOrNull { it.first == clave }?.second ?: clave
    private fun fichero(c: Context) = File(c.filesDir, "solo.json")

    fun linea(c: Context): String? = try {
        val j = JSONObject(fichero(c).readText())
        val l = j.optString("linea", "")
        if (j.optBoolean("activo", true) && LINEAS.any { it.first == l }) l else null
    } catch (e: Exception) { null }

    fun guardar(c: Context, linea: String?) {
        val j = if (linea == null) JSONObject().put("activo", false) else JSONObject().put("linea", linea).put("idioma", "es")
        val tmp = File(c.filesDir, "solo.json.tmp")
        tmp.writeText(j.toString())
        tmp.renameTo(fichero(c))
    }
}
