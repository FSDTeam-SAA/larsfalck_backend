import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Blocks access if user has no active subscription.
 * Trial users can still access song play — but not favorites, albums, playlists.
 * Apply on specific routes: @UseGuards(JwtAuthGuard, SubscriptionGuard)
 */

@Injectable()
export class SubscriptionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user    = request.user;

    if (!user) throw new ForbiddenException('Authentication required');

    // admin always passes
    if (user.role === 'admin') return true;

    if (!user.hasActiveSubscription) {
      const trialActive =
        user.trialEndsAt && new Date() < new Date(user.trialEndsAt);

      throw new ForbiddenException(
        trialActive
          ? 'This feature requires an active subscription. Your trial only includes song playback.'
          : 'Your trial has expired. Please subscribe to access this feature.',
      );
    }

    return true;
  }
}