import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err, user, info) {
    // If there is an authentication error or the user is not found,
    // do not throw an exception. Just return null to keep it optional.
    if (err || !user) {
      return null;
    }
    return user;
  }
}
