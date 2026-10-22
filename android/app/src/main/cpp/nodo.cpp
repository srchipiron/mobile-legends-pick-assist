// Arranca Node (nodejs-mobile) dentro de la app. Lo que Node escribe en
// stdout/stderr va a logcat y a un fichero que la pantalla de la app enseña.
#include <jni.h>
#include <string>
#include <vector>
#include <cstdlib>
#include <cstring>
#include <cstdio>
#include <pthread.h>
#include <unistd.h>
#include <android/log.h>
#include "node.h"

static int tuberia[2];
static std::string registro;

static void *leerSalida(void *) {
    char trozo[2048];
    ssize_t n;
    while ((n = read(tuberia[0], trozo, sizeof trozo - 1)) > 0) {
        trozo[n] = 0;
        __android_log_write(ANDROID_LOG_INFO, "lector", trozo);
        if (!registro.empty()) {
            FILE *f = fopen(registro.c_str(), "a");
            if (f) { fwrite(trozo, 1, n, f); fclose(f); }
        }
    }
    return nullptr;
}

extern "C" JNIEXPORT void JNICALL
Java_es_srchipiron_lector_Nodo_variable(JNIEnv *env, jobject, jstring nombre, jstring valor) {
    const char *n = env->GetStringUTFChars(nombre, nullptr);
    const char *v = env->GetStringUTFChars(valor, nullptr);
    setenv(n, v, 1);
    env->ReleaseStringUTFChars(nombre, n);
    env->ReleaseStringUTFChars(valor, v);
}

extern "C" JNIEXPORT jint JNICALL
Java_es_srchipiron_lector_Nodo_arrancar(JNIEnv *env, jobject, jobjectArray argumentos, jstring fichero) {
    const char *r = env->GetStringUTFChars(fichero, nullptr);
    registro = r;
    env->ReleaseStringUTFChars(fichero, r);
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    pipe(tuberia);
    dup2(tuberia[1], STDOUT_FILENO);
    dup2(tuberia[1], STDERR_FILENO);
    pthread_t hilo;
    pthread_create(&hilo, nullptr, leerSalida, nullptr);
    pthread_detach(hilo);

    // Node quiere los argumentos seguidos en memoria.
    jsize n = env->GetArrayLength(argumentos);
    std::vector<std::string> textos;
    size_t total = 0;
    for (jsize i = 0; i < n; i++) {
        auto s = (jstring) env->GetObjectArrayElement(argumentos, i);
        const char *c = env->GetStringUTFChars(s, nullptr);
        textos.emplace_back(c);
        total += strlen(c) + 1;
        env->ReleaseStringUTFChars(s, c);
    }
    char *bloque = (char *) calloc(total, 1);
    std::vector<char *> argv;
    char *p = bloque;
    for (auto &t : textos) { memcpy(p, t.c_str(), t.size()); argv.push_back(p); p += t.size() + 1; }
    return node::Start((int) argv.size(), argv.data());
}
