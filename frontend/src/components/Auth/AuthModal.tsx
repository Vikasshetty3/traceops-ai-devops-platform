import React, { useState, useEffect } from "react";
import { LogIn, UserPlus, Shield, X, AlertCircle, ShieldCheck } from "lucide-react";
import { api } from "../../services/api";
import type { User as UserType } from "../../types";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserType, token: string) => void;
  initialMode?: "login" | "signup" | "initAdmin";
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = "login",
}) => {
  const [mode, setMode] = useState<"login" | "signup" | "initAdmin">(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [initSecret, setInitSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminInitialized, setAdminInitialized] = useState<boolean | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      api
        .getAuthStatus()
        .then((res) => {
          setAdminInitialized(res.adminInitialized);
          if (!res.adminInitialized && initialMode !== "signup") {
            setMode("initAdmin");
          }
        })
        .catch(() => {
          setAdminInitialized(true);
        });
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "initAdmin") {
        const res = await api.initAdmin({
          username,
          email,
          password,
          name: name.trim() || undefined,
          initSecret: initSecret.trim() || undefined,
        });
        onSuccess(res.user, res.token);
        onClose();
      } else if (mode === "login") {
        const res = await api.login({ identifier: username, password });
        onSuccess(res.user, res.token);
        onClose();
      } else {
        const res = await api.signup({ username, email, password, name });
        onSuccess(res.user, res.token);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="auth-modal">
        <div className="modal-header">
          <div className="modal-title-wrap">
            {mode === "initAdmin" ? (
              <ShieldCheck className="w-5 h-5 text-amber-400" />
            ) : mode === "login" ? (
              <LogIn className="w-5 h-5 text-sky-400" />
            ) : (
              <UserPlus className="w-5 h-5 text-emerald-400" />
            )}
            <h3>
              {mode === "initAdmin"
                ? "Initialize Platform Administrator"
                : mode === "login"
                ? "Sign In to TraceOps"
                : "Create TraceOps Account"}
            </h3>
          </div>
          <button onClick={onClose} className="btn-close" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {mode === "initAdmin" && (
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              borderRadius: "8px",
              marginBottom: "16px",
              fontSize: "13px",
              color: "#fde68a",
              lineHeight: 1.5,
            }}
          >
            <strong>First-Time Setup:</strong> No administrator account is configured yet.
            Please initialize the primary administrator credentials for this TraceOps deployment.
          </div>
        )}

        {error && (
          <div className="auth-alert error">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {(mode === "signup" || mode === "initAdmin") && (
            <>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={mode === "signup"}
                />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. alex@company.io"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label>{mode === "login" ? "Username or Email" : "Username"}</label>
            <input
              type="text"
              placeholder={mode === "login" ? "Enter your username or email" : "Choose username"}
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

          {mode === "initAdmin" && (
            <div className="form-group">
              <label>
                Initialization Secret <span style={{ color: "#94a3b8", fontWeight: "normal" }}>(Optional)</span>
              </label>
              <input
                type="password"
                placeholder="Leave blank unless ADMIN_INIT_SECRET is enforced"
                value={initSecret}
                onChange={(e) => setInitSecret(e.target.value)}
              />
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-auth-submit">
            {loading ? (
              <span>Authenticating...</span>
            ) : mode === "initAdmin" ? (
              <>
                <Shield className="w-4 h-4" />
                <span>Initialize Administrator</span>
              </>
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
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
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
                  Create Account
                </button>
              </p>
              {adminInitialized === false && (
                <p>
                  Platform operator?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("initAdmin");
                      setError(null);
                    }}
                    className="link-switch"
                  >
                    Initialize First Administrator
                  </button>
                </p>
              )}
            </div>
          ) : mode === "signup" ? (
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
          ) : (
            <p>
              Administrator already configured?{" "}
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
