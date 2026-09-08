import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

/*
 * Firebase is configured from local.properties rather than google-services.json.
 *
 * It keeps project credentials out of version control and lets the same source
 * tree point at a staging or production project by editing one untracked file,
 * instead of swapping a JSON blob that is easy to commit by accident.
 */
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun prop(key: String): String = localProps.getProperty(key) ?: ""

android {
    namespace = "rw.smartgarage.reception"
    compileSdk = 35

    defaultConfig {
        applicationId = "rw.smartgarage.reception"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        buildConfigField("String", "FB_PROJECT_ID", "\"${prop("firebase.projectId")}\"")
        buildConfigField("String", "FB_APP_ID", "\"${prop("firebase.appId")}\"")
        buildConfigField("String", "FB_API_KEY", "\"${prop("firebase.apiKey")}\"")
        buildConfigField("String", "FB_SENDER_ID", "\"${prop("firebase.messagingSenderId")}\"")
        buildConfigField("String", "FB_STORAGE_BUCKET", "\"${prop("firebase.storageBucket")}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation("androidx.activity:activity-compose:1.9.2")

    implementation(platform("androidx.compose:compose-bom:2024.09.03"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation(platform("com.google.firebase:firebase-bom:33.5.1"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")
}