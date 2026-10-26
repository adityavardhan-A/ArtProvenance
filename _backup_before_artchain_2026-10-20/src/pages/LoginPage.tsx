import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SuccessOverlay from '../components/SuccessOverlay';
import AuthLayout from '../components/AuthLayout';
import Alert from '../components/Alert';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const { signIn, user } = useAuth();

  // Already signed in: skip the form (but let the welcome overlay finish).
  if (user && !showSuccess) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setShowSuccess(true);
    }
  };

  return (
    <>
      <SuccessOverlay
        isVisible={showSuccess}
        title="Welcome back"
        message="Opening your collection."
        onClose={() => setShowSuccess(false)}
      />

      <AuthLayout title="Sign in" subtitle="Pick up where you left off.">
        <form className="space-y-7" onSubmit={handleSubmit}>
          {error && <Alert type="error" message={error} onClose={() => setError('')} />}

          <div>
            <label htmlFor="email" className="field-label">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
              placeholder="you@studio.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="field-label">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center text-ink-faint hover:text-ink"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full py-3">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-sm text-ink-soft">
            New here?{' '}
            <Link to="/signup" className="btn-link">
              Create an account
            </Link>
          </p>
        </form>
      </AuthLayout>
    </>
  );
}
