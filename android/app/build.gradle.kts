import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// La versión es la de la app (package.json): así se sabe qué lector lleva cada APK.
val versionApp = (JsonSlurper().parse(rootProject.file("../package.json")) as Map<*, *>)["version"] as String
val (mayor, menor, parche) = versionApp.split(".").map { it.toInt() }

android {
    namespace = "es.srchipiron.lector"
    compileSdk = 35
    ndkVersion = "27.2.12479018"

    defaultConfig {
        applicationId = "es.srchipiron.lector"
        minSdk = 26
        targetSdk = 35
        versionCode = mayor * 10000 + menor * 100 + parche
        versionName = versionApp
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
        // libnode.so (nodejs-mobile) pide libc++_shared.so: sin él la app se cerraba nada más abrirse (3.61.1).
        externalNativeBuild { cmake { cppFlags += "-std=c++17"; arguments += "-DANDROID_STL=c++_shared" } }
    }

    // La firma: SIEMPRE la misma clave, o Android no deja actualizar la app
    // sin desinstalarla (y se perdería lo aprendido). La da el workflow desde
    // un secreto; sin ella (compilando a mano) se firma con la de depuración.
    val almacen = System.getenv("LECTOR_FIRMA")
    signingConfigs {
        if (almacen != null) create("publicada") {
            storeFile = file(almacen)
            storePassword = System.getenv("LECTOR_FIRMA_CLAVE")
            keyAlias = "lector"
            keyPassword = System.getenv("LECTOR_FIRMA_CLAVE")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (almacen != null) signingConfigs.getByName("publicada") else signingConfigs.getByName("debug")
        }
    }
    externalNativeBuild { cmake { path = file("src/main/cpp/CMakeLists.txt"); version = "3.22.1" } }
    sourceSets["main"].jniLibs.srcDirs("libnode/bin")
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { jniLibs { useLegacyPackaging = true } }
}

dependencies {
    implementation("com.google.zxing:core:3.5.3")
}

// El lector (scripts/lector) y lo que importa del motor (src/motor), copiados
// a la APK en cada compilación: es el MISMO código que corre en Termux y que
// prueban las pruebas, no una copia que pueda quedarse atrás.
val copiarLector by tasks.registering(Sync::class) {
    into("src/main/assets/nodejs-project")
    from(rootProject.file("../scripts/lector")) { into("scripts/lector"); exclude("**/*.sh") }
    from(rootProject.file("../src/motor")) { into("src/motor") }
    from(rootProject.file("nodejs-project"))
}
tasks.named("preBuild") { dependsOn(copiarLector) }
