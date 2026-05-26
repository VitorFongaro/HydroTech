#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <time.h>
#include "config.local.h"

// ========================================
// WIFI
// ========================================

// ========================================
// SUPABASE EDGE FUNCTION
// ========================================

// ========================================
// TOKEN
// ========================================

// ========================================
// SERVIDOR LOCAL
// ========================================

WebServer server(80);

// ========================================
// SENSOR
// ========================================

#define SENSOR 27

volatile int pulsos = 0;

// ========================================
// VARIÁVEIS
// ========================================

float vazao = 0;
float litros = 0;
float custo = 0;
float maiorVazao = 0;

String horarioPico = "--";
String maiorDia = "Hoje";

unsigned long tempoAnterior = 0;
unsigned long inicioSistema = 0;
unsigned long ultimoEnvio = 0;

// ========================================
// INTERRUPÇÃO
// ========================================

void IRAM_ATTR contarPulso() {

    pulsos++;

}

// ========================================
// TEMPO LIGADO
// ========================================

String tempoLigado() {

    unsigned long segundos =
    (millis() - inicioSistema) / 1000;

    int h = segundos / 3600;

    int m = (segundos % 3600) / 60;

    int s = segundos % 60;

    char tempo[30];

    sprintf(
        tempo,
        "%02dh %02dm %02ds",
        h,
        m,
        s
    );

    return String(tempo);

}

// ========================================
// HORÁRIO REAL BRASIL
// ========================================

String horarioAtual() {

    struct tm timeinfo;

    if(!getLocalTime(&timeinfo)) {

        return "--:--:--";

    }

    char horario[30];

    strftime(
        horario,
        sizeof(horario),
        "%H:%M:%S",
        &timeinfo
    );

    return String(horario);

}

// ========================================
// DATA REAL
// ========================================

String dataAtual() {

    struct tm timeinfo;

    if(!getLocalTime(&timeinfo)) {

        return "--/--/----";

    }

    char data[30];

    strftime(
        data,
        sizeof(data),
        "%d/%m/%Y",
        &timeinfo
    );

    return String(data);

}

// ========================================
// API LOCAL
// ========================================

void enviarDados() {

    custo =
    litros * 0.0064;

    String json = "{";

    json += "\"vazao\":";
    json += String(vazao,2);

    json += ",";

    json += "\"litros\":";
    json += String(litros,2);

    json += ",";

    json += "\"custo\":";
    json += String(custo,4);

    json += ",";

    json += "\"tempo\":\"";
    json += tempoLigado();

    json += "\",";

    json += "\"maiorVazao\":";
    json += String(maiorVazao,2);

    json += ",";

    json += "\"horarioPico\":\"";
    json += horarioPico;

    json += "\",";

    json += "\"maiorDia\":\"";
    json += maiorDia;

    json += "\",";

    json += "\"horarioAtual\":\"";
    json += horarioAtual();

    json += "\",";

    json += "\"dataAtual\":\"";
    json += dataAtual();

    json += "\"";

    json += "}";

    server.sendHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    server.send(
        200,
        "application/json",
        json
    );

}

// ========================================
// ENVIAR SUPABASE
// ========================================

void enviarSupabase() {

    if(
        WiFi.status() != WL_CONNECTED
    ) {

        Serial.println(
            "WiFi desconectado"
        );

        return;

    }

    HTTPClient http;

    http.begin(
        supabaseUrl
    );

    http.addHeader(
        "Content-Type",
        "application/json"
    );

    String json = "{";

    json += "\"token\":\"";
    json += token;
    json += "\",";

    json += "\"litros\":";
    json += String(litros,2);

    json += ",";

    json += "\"fluxo\":";
    json += String(vazao,2);

    json += ",";

    json += "\"custo\":";
    json += String(custo,4);

    json += ",";

    json += "\"tempo_ligado\":";
    json += String(
        (millis() - inicioSistema) / 1000
    );

    json += ",";

    json += "\"horario\":\"";
    json += horarioAtual();

    json += "\",";

    json += "\"data\":\"";
    json += dataAtual();

    json += "\"";

    json += "}";

    Serial.println("================================");

    Serial.println(
        "ENVIANDO AO SUPABASE"
    );

    Serial.println("================================");

    Serial.println(json);

    int httpCode =
    http.POST(json);

    Serial.print(
        "HTTP CODE: "
    );

    Serial.println(httpCode);

    if(httpCode > 0) {

        String resposta =
        http.getString();

        Serial.println(
            "RESPOSTA:"
        );

        Serial.println(
            resposta
        );

    }
    else {

        Serial.println(
            "ERRO HTTP"
        );

        Serial.println(
            http.errorToString(httpCode)
        );

    }

    http.end();

}

// ========================================
// CONECTAR WIFI
// ========================================

void conectarWifi() {

    WiFi.begin(
        ssid,
        password
    );

    Serial.print(
        "Conectando WiFi"
    );

    while(
        WiFi.status() != WL_CONNECTED
    ) {

        delay(500);

        Serial.print(".");

    }

    Serial.println("");

    Serial.println(
        "WiFi conectado!"
    );

    Serial.print("IP: ");

    Serial.println(
        WiFi.localIP()
    );

}

// ========================================
// STATUS SERIAL
// ========================================

void imprimirStatus() {

    Serial.println("-------------");

    Serial.print(
        "Horario: "
    );

    Serial.println(
        horarioAtual()
    );

    Serial.print(
        "Data: "
    );

    Serial.println(
        dataAtual()
    );

    Serial.print(
        "Pulsos: "
    );

    Serial.println(
        pulsos
    );

    Serial.print(
        "Vazao: "
    );

    Serial.print(
        vazao
    );

    Serial.println(
        " L/min"
    );

    Serial.print(
        "Litros: "
    );

    Serial.println(
        litros
    );

    Serial.print(
        "Custo: R$ "
    );

    Serial.println(
        custo,
        4
    );

    Serial.print(
        "Tempo ligado: "
    );

    Serial.println(
        tempoLigado()
    );

    Serial.print(
        "Maior vazao: "
    );

    Serial.println(
        maiorVazao
    );

}

// ========================================
// SETUP
// ========================================

void setup() {

    Serial.begin(115200);

    pinMode(
        SENSOR,
        INPUT
    );

    attachInterrupt(
        digitalPinToInterrupt(SENSOR),
        contarPulso,
        FALLING
    );

    conectarWifi();

    /*
    UTC-3 BRASIL
    */

    configTime(
        -3 * 3600,
        0,
        "pool.ntp.org"
    );

    Serial.println(
        "Horario sincronizado"
    );

    inicioSistema =
    millis();

    server.on(
        "/dados",
        enviarDados
    );

    server.begin();

    Serial.println(
        "Servidor iniciado"
    );

}

// ========================================
// LOOP
// ========================================

void loop() {

    server.handleClient();

    // ====================================
    // RECONECTAR WIFI
    // ====================================

    if(
        WiFi.status() != WL_CONNECTED
    ) {

        Serial.println(
            "Reconectando WiFi..."
        );

        conectarWifi();

    }

    // ====================================
    // CALCULAR VAZÃO
    // ====================================

    if(
        millis() - tempoAnterior >= 1000
    ) {

        tempoAnterior =
        millis();

        /*
        PROTEÇÃO INTERRUPÇÃO
        */

        noInterrupts();

        int pulsosCalculados =
        pulsos;

        pulsos = 0;

        interrupts();

        /*
        YF-S201
        7.5 pulsos = 1L/min
        */

        vazao =
        pulsosCalculados / 7.5;

        /*
        REMOVE RUÍDOS
        */

        if(vazao < 0.3) {

            vazao = 0;

        }

        litros +=
        vazao / 60.0;

        custo =
        litros * 0.0064;

        // ================================
        // MAIOR VAZÃO
        // ================================

        if(
            vazao > maiorVazao
        ) {

            maiorVazao =
            vazao;

            horarioPico =
            horarioAtual();

        }

        imprimirStatus();

    }

    // ====================================
    // ENVIAR AO SUPABASE
    // ====================================

    if(
        millis() - ultimoEnvio >= 30000
    ) {

        ultimoEnvio =
        millis();

        enviarSupabase();

    }

}
