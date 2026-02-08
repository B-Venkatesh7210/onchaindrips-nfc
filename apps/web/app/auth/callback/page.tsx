"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { completeZkLogin, getUserInfo } from "@/lib/auth";
import { getAndClearReturnTo } from "@/lib/zklogin-utils";
import { upsertUser } from "@/lib/api";

/**
 * OAuth callback page
 * Handles the redirect from Google OAuth and completes zkLogin flow
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    async function handleCallback() {
      try {
        // Get JWT from URL fragment (Google returns id_token in fragment)
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const idToken = params.get("id_token");

        if (!idToken) {
          throw new Error("No id_token found in callback URL");
        }

        setStatus("processing");
        console.log("Processing zkLogin callback...");

        // Complete zkLogin flow (generate proof and store session)
        const userAddress = await completeZkLogin(idToken);

        // Record user in Supabase (address, auth details)
        const userInfo = getUserInfo();
        await upsertUser({
          address: userAddress,
          auth_provider: "google",
          auth_sub: userInfo?.sub ?? "",
          email: userInfo?.email,
          name: userInfo?.name,
        });

        console.log("zkLogin completed, user address:", userAddress);
        setStatus("success");

        // Redirect to the page user came from, or home
        const returnTo = getAndClearReturnTo() || "/";
        setTimeout(() => {
          router.push(returnTo);
        }, 2000);
      } catch (err) {
        console.error("zkLogin callback error:", err);
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error occurred");
      }
    }

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        {status === "processing" && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold mb-2">Completing zkLogin...</h2>
            <p className="text-gray-600">
              Generating zero-knowledge proof. This may take 30-60 seconds.
            </p>
            <p className="text-sm text-gray-500 mt-4">
              Please do not close this window.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="text-center">
            <div className="text-green-600 text-5xl mb-4">✓</div>
            <h2 className="text-xl font-semibold mb-2">Login Successful!</h2>
            <p className="text-gray-600">Redirecting...</p>
          </div>
        )}

        {status === "error" && (
          <div className="text-center">
            <div className="text-red-600 text-5xl mb-4">✗</div>
            <h2 className="text-xl font-semibold mb-2">Login Failed</h2>
            <p className="text-red-600 text-sm mb-4">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Return Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
