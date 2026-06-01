import { ForbiddenException } from '@nestjs/common';

export class RepositoryOperationForbiddenException extends ForbiddenException {
  constructor(message = '当前账号没有该仓库的操作权限') {
    super({
      code: 'REPOSITORY_OPERATION_FORBIDDEN',
      message,
    });
  }
}
