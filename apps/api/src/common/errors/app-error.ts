import { HttpException, HttpStatus } from "@nestjs/common";

export class AppError extends HttpException {
  constructor(message: string, status = HttpStatus.BAD_REQUEST) {
    super({ detail: message }, status);
  }
}
