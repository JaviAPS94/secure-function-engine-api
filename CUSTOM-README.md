# Secure Function Engine API

Servicio NestJS que cifra, valida y evalúa las fórmulas matemáticas de diseño
de Rymel. Guarda el activo intelectual del negocio: las expresiones se
almacenan cifradas en `project-back` y solo este servicio puede resolverlas,
de modo que `project-front` obtiene resultados sin ver nunca la fórmula.

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `ENCRYPTION_KEY` | Sí | Clave AES de **exactamente 32 bytes**. Se verifica al arrancar: si falta o mide otra cosa, el proceso no arranca. **Las fórmulas ya cifradas dependen de ella**: cambiarla las vuelve ilegibles para siempre. |
| `SFE_SERVICE_SECRET` | Sí en producción | Secreto compartido con `project-back` que protege `POST /function-engine/decrypt`. Mientras no esté configurada, el descifrado queda abierto y el servicio avisa en cada petición. |
| `PORT` | No | Puerto de escucha. Por omisión 3000; en los despliegues actuales, 5000. |

### Orden de despliegue

`SFE_SERVICE_SECRET` tiene una ventana de transición deliberada: si no está
configurada, el guard deja pasar. Es para que este servicio pueda desplegarse
**antes** que la versión de `project-back` que envía el secreto. Si se
exigiera desde el primer momento, el descifrado respondería 401 y ningún
administrador podría editar una fórmula.

La secuencia es: desplegar el SFE sin el secreto → desplegar `project-back`
enviándolo → configurar `SFE_SERVICE_SECRET` aquí y reiniciar. A partir de ese
punto la ventana está cerrada.

## Instalación

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Endpoints

Todas las fórmulas tienen la forma `y = <expresión>`. El lado izquierdo debe
ser literalmente `y`.

### `POST /function-engine/validate`

Valida una expresión y declara los símbolos que usa. **No cifra, no almacena y
no registra la expresión.** Alimenta el editor y el probador del administrador.

```json
// petición
{ "plainTextFunction": "y = x^2 + CONST_1" }
// respuesta
{ "valid": true, "symbols": ["x", "CONST_1"], "functions": [] }
```

Si no es válida: `{ "valid": false, "error": "..." }`.

### `POST /function-engine/encrypt`

Valida y cifra. El vector de inicialización es aleatorio, así que dos cifrados
de la misma fórmula dan textos distintos.

```json
{ "plainTextFunction": "y = x^2 + CONST_1" }
// -> { "encrypted": "<iv-hex>:<ciphertext-hex>" }
```

### `POST /function-engine/evaluate-function`

Descifra y evalúa. Las constantes y las variables entran como símbolos del
ámbito de evaluación; si un nombre está en ambos, gana la constante.

```json
{
  "encryptedFunction": "<iv-hex>:<ciphertext-hex>",
  "parameters": { "x": 3 },
  "constants": { "CONST_1": 7 }
}
// -> { "result": 16 }
```

### `POST /function-engine/decrypt` — privilegiado

Devuelve la expresión en texto plano para que un administrador pueda editarla.
Es la única operación que expone el activo protegido.

- Exige el encabezado `x-service-secret` con el valor de `SFE_SERVICE_SECRET`.
  La comparación es en tiempo constante sobre resúmenes de largo fijo: un
  acierto parcial no se distingue de un fallo total.
- Admite `x-correlation-id` para poder seguir el acceso hasta el usuario que
  lo originó en `project-back`.
- Cada intento queda auditado, se atienda o se rechace. **La auditoría nunca
  incluye la expresión, el texto cifrado ni la clave.**
- Solo lo invoca `project-back`, y solo en nombre de un usuario ADMIN.
  `project-front` no tiene ninguna ruta hasta aquí.

```
POST /function-engine/decrypt
x-service-secret: <SFE_SERVICE_SECRET>
{ "encryptedFunction": "<iv-hex>:<ciphertext-hex>" }
// -> { "plainTextFunction": "y = x^2 + CONST_1" }
```

## Notas de seguridad

- **Las constantes se sustituyen por símbolo, nunca por texto.** El servicio
  las reemplazaba antes con `replace` sobre la expresión: con `CONST_1 = 4`,
  la expresión `CONST_10 + CONST_1` se convertía en `40 + 4` y devolvía 44 en
  vez de 13 — sin error, solo un número equivocado. Y una constante llamada
  `c` convertía `cos(x)` en `2os(x)`. Ahora las constantes entran en el ámbito
  de evaluación y mathjs resuelve cada nombre completo o no lo resuelve.
- **Las funciones que se salen de la aritmética están prohibidas**
  (`import`, `createUnit`, `evaluate`, `parse`, `compile`, ...). Sin esa
  restricción, quien pudiera cifrar una expresión podría convertir el motor en
  un intérprete de propósito general.
- **Los errores de descifrado no detallan la criptografía.** Distinguir
  "relleno inválido" de "IV de largo equivocado" solo le sirve a quien esté
  probando textos cifrados ajenos.
- **La clave se verifica al arrancar.** Un despliegue mal configurado no llega
  a atender peticiones, en vez de fallar en la primera petición de cifrado con
  un error que no dice qué está mal.

## License

This project is MIT licensed.
