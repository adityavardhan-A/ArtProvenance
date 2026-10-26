import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SuccessOverlay from '../components/SuccessOverlay';
import AuthLayout from '../components/AuthLayout';
import Alert from '../components/Alert';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const { signUp, user } = useAuth();

  if (user && !showSuccess) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('The two passwords don’t match.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Use at least 6 characters for your password.');
      setLoading(false);
      return;
    }

    const { error } = await signUp(email, password, fullName);

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
        title="Account created"
        message="Your works will be credited to the name you gave."
        onClose={() => setShowSuccess(false)}
      />

      <AuthLayout title="Create an account" subtitle="The name you give is how collectors will see you credited.">
        <form className="space-y-7" onSubmit={handleSubmit}>
          {error && <Alert type="error" message={error} onClose={() => setError('')} />}

          <div>
            <label htmlFor="fullName" className="field-label">Name as it should appear on your works</label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="field"
            />
          </div>

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

          <div className="grid gap-7 sm:grid-cols-2 sm:gap-5">
            <div>
              <label htmlFor="password" className="field-label">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field pr-8"
                  placeholder="6+ characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center text-ink-faint hover:text-ink"
                  aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="confirmPassword" className="field-label">Repeat password</label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="field"
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full py-3">
            {loading ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-sm text-ink-soft">
            Already registered?{' '}
            <Link to="/login" className="btn-link">
              Sign in
            </Link>
          </p>
        </form>
      </AuthLayout>
    </>
  );
}
