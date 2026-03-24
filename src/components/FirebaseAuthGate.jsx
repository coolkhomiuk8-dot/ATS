import { useState } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "../lib/firebase";

export default function FirebaseAuthGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleEmailAuth(event) {
    event.preventDefault();
    if (!auth) return;

    setIsBusy(true);
    setError("");

    try {
      if (isRegisterMode) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      setError(err?.message || "Authentication failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleGoogleLogin() {
    if (!auth) return;

    setIsBusy(true);
    setError("");

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError(err?.message || "Google sign-in failed.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-bg-shape auth-bg-shape--one" />
      <div className="auth-bg-shape auth-bg-shape--two" />

      <div className="auth-card f-up">
        <div className="auth-card__badge">Driver CRM</div>
        <h1 className="auth-card__title">Firebase Sign In</h1>
        <p className="auth-card__subtitle">Use your Email/Password or Google account to access driver data.</p>

        <form className="auth-form" onSubmit={handleEmailAuth}>
          <label className="auth-label" htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
            className="auth-input"
            autoComplete="email"
            required
            disabled={isBusy}
          />

          <label className="auth-label" htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            className="auth-input"
            autoComplete={isRegisterMode ? "new-password" : "current-password"}
            required
            disabled={isBusy}
          />

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit btn-p" disabled={isBusy}>
            {isBusy ? "Please wait..." : isRegisterMode ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          className="auth-switch"
          onClick={() => setIsRegisterMode((prev) => !prev)}
          disabled={isBusy}
        >
          {isRegisterMode ? "Already have an account? Sign in" : "No account yet? Create one"}
        </button>

        <div className="auth-divider"><span>or</span></div>

        <button type="button" className="auth-google" onClick={handleGoogleLogin} disabled={isBusy}>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
