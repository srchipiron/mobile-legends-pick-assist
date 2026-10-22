package es.srchipiron.lector

import android.content.Context
import java.io.File

/**
 * Node (nodejs-mobile) con el lector de siempre (scripts/lector/en-tablet.mjs).
 * Se arranca UNA vez por proceso: Node no se puede volver a arrancar dentro
 * del mismo, así que si se para, la app se cierra y se abre de cero.
 */
object Nodo {
    init {
        System.loadLibrary("node")
        System.loadLibrary("lector")
    }

    private external fun variable(nombre: String, valor: String)
    private external fun arrancar(argumentos: Array<String>, registro: String): Int

    @Volatile var arrancado = false
        private set

    fun registro(contexto: Context) = File(contexto.filesDir, "lector.log")

    @Synchronized
    fun arrancar(contexto: Context, variables: Map<String, String>, alSalir: (Int) -> Unit) {
        if (arrancado) return
        arrancado = true
        val proyecto = copiarProyecto(contexto)
        val log = registro(contexto)
        if (log.length() > 512 * 1024) log.delete()
        for ((n, v) in variables) variable(n, v)
        variable("HOME", contexto.filesDir.absolutePath)
        Thread({
            val codigo = arrancar(arrayOf("node", File(proyecto, "scripts/lector/en-tablet.mjs").absolutePath), log.absolutePath)
            alSalir(codigo)
        }, "nodo").apply { isDaemon = true; start() }
    }

    /** El lector va en los assets; se copia a disco cuando cambia la versión de la app. */
    private fun copiarProyecto(contexto: Context): File {
        val destino = File(contexto.filesDir, "nodejs-project")
        val marca = File(contexto.filesDir, "nodejs-project.version")
        val version = contexto.packageManager.getPackageInfo(contexto.packageName, 0).longVersionCode.toString()
        if (destino.isDirectory && marca.exists() && marca.readText() == version) return destino
        destino.deleteRecursively()
        copiar(contexto, "nodejs-project", destino)
        marca.writeText(version)
        return destino
    }

    private fun copiar(contexto: Context, ruta: String, destino: File) {
        val hijos = contexto.assets.list(ruta) ?: emptyArray()
        if (hijos.isEmpty()) {
            destino.parentFile?.mkdirs()
            contexto.assets.open(ruta).use { e -> destino.outputStream().use { s -> e.copyTo(s) } }
            return
        }
        destino.mkdirs()
        for (h in hijos) copiar(contexto, "$ruta/$h", File(destino, h))
    }
}
