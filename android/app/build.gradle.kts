plugins { id("com.android.application") }
android {
    namespace = "com.truckcontrolai.app"
    compileSdk = 36
    buildToolsVersion = "36.0.0"
    defaultConfig {
        applicationId = "com.truckcontrolai.app"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.5.21-rc.1"
    }
    buildTypes {
        debug { applicationIdSuffix = ".debug"; versionNameSuffix = "-debug" }
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // No release key in source or public CI; the release bundle is unsigned.
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    testOptions { unitTests.isReturnDefaultValues = false }
}
dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
    testImplementation("junit:junit:4.13.2")
}
