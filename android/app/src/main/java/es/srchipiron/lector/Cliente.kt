package es.srchipiron.lector

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * El ÚNICO sitio que habla con el lector de la propia tablet: siempre
 * 127.0.0.1, el puerto del contrato (`PUERTO` de src/comun/contrato.js) y el
 * código de vinculación. Sin `Origin` (un navegador siempre lo pone): así sabe
 * el lector que es la APK. Las rutas son las de la APK en `RUTAS`; android.test
 * lo exige ruta a ruta.
 */
object Cliente {
    const val PUERTO = 47323

    /** Lo que contestó: el código HTTP (0 si no contestó) y el cuerpo, si es JSON. */
    class Respuesta(val estado: Int, val json: JSONObject?)

    private fun abrir(contexto: Context, ruta: String, espera: Int): HttpURLConnection {
        require(ruta.startsWith("/") && !ruta.contains("//") && !ruta.contains("@")) { "ruta del lector sin forma" }
        return (URL("http://127.0.0.1:$PUERTO$ruta").openConnection() as HttpURLConnection).apply {
            connectTimeout = 2000
            readTimeout = espera
            setRequestProperty("X-Lector-Codigo", Vinculo.codigo(contexto))
        }
    }

    private fun leer(c: HttpURLConnection): Respuesta {
        val estado = c.responseCode
        val texto = try { (if (estado < 400) c.inputStream else c.errorStream)?.bufferedReader()?.readText() } catch (e: Exception) { null }
        return Respuesta(estado, try { texto?.let { JSONObject(it) } } catch (e: Exception) { null })
    }

    /** GET: el cuerpo si contesta 200, null si contesta otra cosa; LANZA si no llega (la burbuja dice por qué). */
    fun consultar(contexto: Context, ruta: String, espera: Int = 3000): JSONObject? {
        val c = abrir(contexto, ruta, espera)
        return try { leer(c).takeIf { it.estado == 200 }?.json } finally { c.disconnect() }
    }

    /** GET: el cuerpo si contesta 200; null si no, o si no contesta. */
    fun pedir(contexto: Context, ruta: String, espera: Int = 3000): JSONObject? = try { consultar(contexto, ruta, espera) } catch (e: Throwable) { null }

    /** POST con un JSON: lo que contestó, o estado 0 si no contestó. */
    fun mandar(contexto: Context, ruta: String, cuerpo: JSONObject, espera: Int = 20000): Respuesta = try {
        val c = abrir(contexto, ruta, espera)
        c.requestMethod = "POST"
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.outputStream.use { it.write(cuerpo.toString().toByteArray()) }
        try { leer(c) } finally { c.disconnect() }
    } catch (e: Throwable) { Respuesta(0, null) }
}
