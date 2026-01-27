# Alexa Skill (Privada) - GlucoData (Python)

Esta carpeta contiene una Skill **Custom** para Alexa (Python / AWS Lambda) para consultar tu glucemia actual.

La Skill **NO** accede a tus credenciales de LibreLink. Solo consulta tu backend ya existente:

- Endpoint: `GET /api/latest`
- Autenticación: `Authorization: Bearer <GLUCO_API_TOKEN>`

## 1) Requisitos

- Una cuenta de **Amazon Developer** (Alexa Developer Console)
- Una cuenta de **AWS** (para Lambda)
- Tu backend accesible desde internet (por ejemplo Vercel/Netlify/etc.)

## 2) Backend: configurar endpoint para consumo de Alexa

En tu proyecto ya existe un endpoint:

- `src/app/api/latest/route.ts`

Este endpoint requiere:

- `GLUCO_API_TOKEN` (server-side)

Probá que funcione (desde tu máquina):

```bash
curl -s \
  -H "Authorization: Bearer TU_TOKEN" \
  "https://TU_DOMINIO/api/latest"
```

Debe devolver `{"success": true, "data": ...}`.

## 3) Crear la Skill en Alexa Developer Console (modo privado)

1. Ir a [Alexa Developer Console (ASK)](https://developer.amazon.com/alexa/console/ask)
2. **Create Skill**
3. **Skill name**: `GlucoData`
4. **Primary locale**: `Spanish (ES)`
5. **Experience**: `Custom`
6. **Hosting**: `Provision your own`
7. Crear.

Luego:

- En **Interaction Model** importá el archivo:
  - `skill-package/interactionModels/custom/es-ES.json`

- Guardar y **Build Model**.

## 4) Crear la función AWS Lambda (Python)

### 4.1 Runtime

- Runtime recomendado: **Python 3.12** (o 3.11)
- Handler: `lambda_function.lambda_handler`

### 4.2 Variables de entorno

Configurar estas variables en Lambda:

- `GLUCO_API_URL` = `https://TU_DOMINIO/api/latest`
- `GLUCO_API_TOKEN` = `TU_TOKEN`

### 4.3 Empaquetado y deploy

En la carpeta `alexa-skill-glucodata/lambda`:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r ../requirements.txt -t .
zip -r function.zip .
```

Subí `function.zip` a Lambda.

## 5) Conectar Alexa Skill con Lambda

En la Alexa Developer Console:

1. Ir a **Endpoint**
2. Seleccionar **AWS Lambda ARN**
3. Pegar el ARN de la función Lambda.

En `skill-package/skill.json` vas a ver un placeholder de ARN. Podés ignorarlo si configurás el endpoint desde la consola.

## 6) Permitir uso privado (solo tu cuenta)

Sin publicar:

- En la consola de Alexa, en la pestaña **Test**, seleccionar **Development**.
- Loguearte con la **misma cuenta** en tu app Alexa (celular) o en el dispositivo.

## 7) Cómo invocarla

Con el invocation name por defecto: `mi glucemia`

Ejemplos:

- "Alexa, abre mi glucemia"
- "Alexa, pregúntale a mi glucemia cuánta glucemia tengo"

## Notas de seguridad

- No subas tu `GLUCO_API_TOKEN` a git.
- Si querés rotar el token, cambiá `GLUCO_API_TOKEN` en tu backend y en Lambda.
