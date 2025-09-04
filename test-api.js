// Example usage of the Secure Function Engine API
// Run this file after starting the server with npm run start

const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000';

async function testEncryptionAPI() {
  console.log('🔐 Testing Encryption API...');

  // 1. Encrypt data
  const dataToEncrypt = 'This is a secret message!';
  console.log(`\nEncrypting data: "${dataToEncrypt}"`);

  const encryptResponse = await fetch(`${API_URL}/encryption/encrypt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: dataToEncrypt }),
  });

  const encryptResult = await encryptResponse.json();
  console.log('Encryption result:', encryptResult);

  // 2. Decrypt data
  console.log('\nDecrypting data...');

  const decryptResponse = await fetch(`${API_URL}/encryption/decrypt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      encryptedData: encryptResult.encryptedData,
      key: encryptResult.key,
    }),
  });

  const decryptResult = await decryptResponse.json();
  console.log('Decryption result:', decryptResult);

  console.log(
    `\nVerifying decryption: "${decryptResult.decryptedData}" === "${dataToEncrypt}"`,
  );
  console.log(
    'Decryption successful:',
    decryptResult.decryptedData === dataToEncrypt,
  );
}

async function testFunctionEngineAPI() {
  console.log('\n\n🧮 Testing Function Engine API...');

  // 1. Encrypt a function
  const functionToEncrypt = `function add(a, b) {
  return a + b;
}`;

  console.log(`\nEncrypting function: ${functionToEncrypt}`);

  const encryptFunctionResponse = await fetch(
    `${API_URL}/function-engine/encrypt`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ function: functionToEncrypt }),
    },
  );

  const encryptFunctionResult = await encryptFunctionResponse.json();
  console.log('Function encryption result:', encryptFunctionResult);

  // 2. Execute the encrypted function
  console.log('\nExecuting encrypted function with parameters [5, 3]...');

  const executeResponse = await fetch(`${API_URL}/function-engine/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      encryptedFunction: encryptFunctionResult.encryptedFunction,
      key: encryptFunctionResult.key,
      parameters: [5, 3],
    }),
  });

  const executeResult = await executeResponse.json();
  console.log('Execution result:', executeResult);
  console.log('Expected result: 8');
  console.log('Execution successful:', executeResult.result === 8);
}

async function main() {
  try {
    await testEncryptionAPI();
    await testFunctionEngineAPI();

    console.log('\n\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Error during tests:', error);
    console.log('Make sure the server is running on http://localhost:3000');
  }
}

main();
