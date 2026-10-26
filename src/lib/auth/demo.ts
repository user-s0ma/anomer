/** お試しの共有アカウント。パスワードを持たず、/api/auth/sign-in/demo からだけ入れる */
export const DEMO_EMAIL = "demo@anomer.invalid";
export const DEMO_NAME = "Demo";

export function isDemoUser(user: { email: string }) {
  return user.email === DEMO_EMAIL;
}
