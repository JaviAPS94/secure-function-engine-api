# Secure Function Engine API

A NestJS API that provides secure function encryption and execution capabilities.

## Description

This API allows you to:

1. Encrypt/decrypt arbitrary data using AES encryption
2. Encrypt JavaScript functions for secure storage
3. Execute encrypted JavaScript functions with parameters in a sandboxed environment

## Installation

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

## API Endpoints

### Encryption Module

#### 1. Encrypt Data

- **Endpoint**: `POST /encryption/encrypt`
- **Body**:
  ```json
  {
    "data": "The data to encrypt",
    "key": "Optional custom encryption key"
  }
  ```
- **Response**:
  ```json
  {
    "encryptedData": "encrypted_string_here",
    "key": "encryption_key_here"
  }
  ```

#### 2. Decrypt Data

- **Endpoint**: `POST /encryption/decrypt`
- **Body**:
  ```json
  {
    "encryptedData": "encrypted_string_here",
    "key": "encryption_key_here"
  }
  ```
- **Response**:
  ```json
  {
    "decryptedData": "The original data"
  }
  ```

### Function Engine Module

#### 1. Encrypt Function

- **Endpoint**: `POST /function-engine/encrypt`
- **Body**:
  ```json
  {
    "function": "function add(a, b) { return a + b; }",
    "key": "Optional custom encryption key"
  }
  ```
- **Response**:
  ```json
  {
    "encryptedFunction": "encrypted_function_string_here",
    "key": "encryption_key_here"
  }
  ```

#### 2. Execute Encrypted Function

- **Endpoint**: `POST /function-engine/execute`
- **Body**:
  ```json
  {
    "encryptedFunction": "encrypted_function_string_here",
    "key": "encryption_key_here",
    "parameters": [5, 3]
  }
  ```
- **Response**:
  ```json
  {
    "result": 8,
    "executed": true
  }
  ```

## Security Considerations

- The API implements basic sandboxing for function execution, but for production use, consider using more robust sandboxing solutions
- The encryption uses AES with secure key generation
- Always store encryption keys securely
- Validate all input functions before encryption to prevent malicious code execution

## Example Usage

### 1. Encrypt a Function

```javascript
const calculateArea = `function calculateArea(radius) {
  return Math.PI * radius * radius;
}`;

// POST to /function-engine/encrypt with the function
// Store the encryptedFunction and key for later use
```

### 2. Execute the Encrypted Function

```javascript
// POST to /function-engine/execute with:
// - The encrypted function
// - The encryption key
// - Parameters: [5]
// Result will be the area of a circle with radius 5 (approximately 78.54)
```

## License

This project is MIT licensed.
