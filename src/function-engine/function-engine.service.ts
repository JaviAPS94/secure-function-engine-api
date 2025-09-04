import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { parse } from 'mathjs';

@Injectable()
export class FunctionEngineService {
  key = process.env.ENCRYPTION_KEY!; // 32 bytes
  ivLength = 16;

  constructor() {}

  decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.key),
      iv,
    );
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }

  validateMathFunction(func: string): { valid: boolean; error?: string } {
    const parts = func.split('=');
    if (parts.length !== 2) {
      return {
        valid: false,
        error: 'Function must contain exactly one equal sign (=)',
      };
    }

    const leftSide = parts[0].trim();
    const rightSide = parts[1].trim();

    if (leftSide !== 'y') {
      return { valid: false, error: 'Function must start with "y ="' };
    }

    try {
      parse(rightSide);
    } catch (err) {
      return {
        valid: false,
        error: 'Invalid math syntax: ' + (err as Error).message,
      };
    }

    return { valid: true };
  }

  encryptFunction(plainTextFunction: string): {
    encrypted: string;
  } {
    //validate if plainTextFunction is a valid math function
    const validationResult = this.validateMathFunction(plainTextFunction);
    if (!validationResult.valid) {
      throw new BadRequestException(validationResult.error);
    }

    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.key),
      iv,
    );
    let encrypted = cipher.update(plainTextFunction);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const encryptedFunction =
      iv.toString('hex') + ':' + encrypted.toString('hex');

    return { encrypted: encryptedFunction };
  }

  evaluateFunction(
    encryptedFunction: string,
    variables: Record<string, number>,
    constants: Record<string, number> = {},
  ) {
    const equation = this.decrypt(encryptedFunction);

    const parts = equation.split('=');
    if (parts.length !== 2 || parts[0].trim() !== 'y') {
      throw new Error('Equation must be in the form "y = ..."');
    }

    let rightSide = parts[1];

    // Replace constants in the expression
    for (const [key, value] of Object.entries(constants)) {
      if (typeof value !== 'number' || isNaN(value)) {
        throw new Error(`Constant ${key} must be a valid number`);
      }
      rightSide = rightSide.replace(new RegExp(key, 'g'), value.toString());
    }

    console.log('Right side after replacing constants:', rightSide);

    const expr = parse(rightSide);

    const result: unknown = expr.evaluate(variables);

    if (typeof result !== 'number' || isNaN(result)) {
      throw new Error('Evaluation did not return a valid number');
    }

    return { result };
  }
}
