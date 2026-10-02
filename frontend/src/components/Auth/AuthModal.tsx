import React, { useState } from "react";
import { User, LogIn, UserPlus, Shield, X, AlertCircle } from "lucide-react";
import { api } from "../../services/api";
import type { User as UserType } from "../../types";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserType, token: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "login") {
        const res = await api.login({ identifier: username, password });
        onSuccess(res.user, res.token);
        onClose();
      } else {
        const res = await api.signup({ username, email, password, name, role });
        onSuccess(res.user, res.token);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please check credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (demoType: "user" | "admin") => {
    setMode("login");
    if (demoType === "user") {
      setUsername("user");
      setPassword("user123");
    } else {
      setUsername("admin");
      setPassword("admin123");
    }
    setError(null);
  };

  return (
    <div className="modal-backdrop">
      <div className="auth-modal">
        <div className="modal-header">
          <div className="modal-title-wrap">
            {mode === "login" ? (
              <LogIn className="w-5 h-5 text-sky-400" />
            ) : (
              <UserPlus className="w-5 h-5 text-emerald-400" />
            )}
            <h3>{mode === "login" ? "Sign In to TraceOps" : "Create TraceOps Account"}</h3>
          </div>
          <button onClick={onClose} className="btn-close" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Demo Fill Buttons */}
        <div className="demo-credentials-banner">
          <span className="demo-label">Quick Demo Access:</span>
          <div className="demo-btn-group">
            <button
              type="button"
              onClick={() => handleQuickDemo("user")}
              className="btn-demo-badge user"
              title="Autofill standard User credentials"
            >
              <User className="w-3.5 h-3.5" />
              <span>Demo User</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo("admin")}
              className="btn-demo-badge admin"
              title="Autofill Administrator credentials"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Demo Admin</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="auth-alert error">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "signup" && (
            <>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. alex@traceops.io"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label>Username or Email</label>
            <input
              type="text"
              placeholder="e.g. user or admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter secure password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {mode === "signup" && (
            <div className="form-group">
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as "USER" | "ADMIN")}>
                <option value="USER">USER — Complete DevOps Platform Workspace</option>
                <option value="ADMIN">ADMIN — Global Visibility & Platform Management</option>
              </select>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-auth-submit">
            {loading ? (
              <span>Authenticating...</span>
            ) : mode === "login" ? (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Create Account</span>
              </>
            )}
          </button>
        </form>

        <div className="modal-footer">
          {mode === "login" ? (
            <p>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className="link-switch"
              >
                Sign Up
              </button>
            </p>
          ) : (
            <p>
              Already registered?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className="link-switch"
              >
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
