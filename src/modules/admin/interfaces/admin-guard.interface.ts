/**
 * IAdminGuard — placeholder interface for future authentication/authorization guards.
 *
 * When authentication and RBAC are implemented, admin guards should:
 *   1. Verify a valid JWT token is present in the Authorization header.
 *   2. Decode the token and check that the user has the ADMIN role.
 *   3. Attach the authenticated admin user to the request context.
 *
 * Usage (future):
 *   @UseGuards(AdminAuthGuard, AdminRoleGuard)
 *   @Controller('admin/bookings')
 *   export class AdminBookingsController { ... }
 */
export interface IAdminGuard {
  canActivate(context: unknown): boolean | Promise<boolean>;
}
