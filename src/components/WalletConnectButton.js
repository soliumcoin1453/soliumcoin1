import React, { useState, useEffect } from "react";
import { Core } from "@walletconnect/core";
import {
  buildApprovedNamespaces,
  getSdkError,
  populateAuthPayload,
  buildAuthObject,
} from "@walletconnect/utils";
import { WalletKit } from "@reown/walletkit";
import { formatJsonRpcResult } from "@walletconnect/jsonrpc-utils";
import QRCode from "qrcode";
import { ethers } from "ethers";
import "./styles.css";

// WalletKit'i hemen başlat (Deep Link için)
const core = new Core({
  projectId: process.env.REACT_APP_PROJECT_ID, // REACT_APP_PROJECT_ID kullanıyoruz
});

let walletKitInstance = null;
let isInitializing = false; // Başlatma durumunu takip et

async function initializeWalletKitGlobal(setErrorCallback) {
  if (isInitializing || walletKitInstance) {
    console.log("WalletKit already initialized or initializing");
    return;
  }

  isInitializing = true;
  try {
    walletKitInstance = await WalletKit.init({
      core,
      metadata: {
        name: "SoliumCoin",
        description: "SoliumCoin DApp",
        url: "https://soliumcoin.com",
        icons: ["https://soliumcoin.com/favicon.ico"],
      },
    });
    console.log("WalletKit globally initialized");

    // Eski pairing'leri temizle
    await walletKitInstance.core.pairing
      .getPairings()
      .forEach(async (pairing) => {
        try {
          await walletKitInstance.core.pairing.disconnect({ topic: pairing.topic });
          console.log(`Cleared old pairing: ${pairing.topic}`);
        } catch (err) {
          console.error(`Failed to clear pairing ${pairing.topic}:`, err);
        }
      });
  } catch (err) {
    console.error("Global WalletKit initialization failed:", err);
    setErrorCallback(`WalletKit başlatılamadı: ${err.message}`);
  } finally {
    isInitializing = false;
  }
}

const WalletConnectButton = () => {
  const [walletKit, setWalletKit] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [uri, setUri] = useState("");
  const [isLoading, setIsLoading] = useState(true); // Başlatma durumunu takip et

  // WalletKit'i bileşen seviyesinde güncelle ve olay dinleyicilerini ekle
  useEffect(() => {
    async function setupWalletKit() {
      try {
        await initializeWalletKitGlobal(setError);
        if (walletKitInstance) {
          setWalletKit(walletKitInstance);
          setIsLoading(false);
          console.log("walletKit state updated:", walletKitInstance);

          // Pairing expiry olayını dinle
          core.pairing.events.on("pairing_expire", (event) => {
            console.log("Pairing expired:", event);
            setError("Bağlantı süresi doldu, lütfen tekrar deneyin.");
            setQrCodeUrl("");
            setUri("");
          });

          // Session proposal olayını dinle (Dinamik yaklaşım)
          walletKitInstance.on("session_proposal", async ({ id, params }) => {
            try {
              console.log("Session proposal params:", params);

              const { requiredNamespaces, optionalNamespaces } = params;
              const supportedChains = ["eip155:56"];
              const supportedMethods = [
                "eth_accounts",
                "eth_requestAccounts",
                "eth_sendTransaction",
                "personal_sign",
                "wallet_switchEthereumChain",
                "wallet_addEthereumChain",
              ];
              const supportedEvents = [
                "chainChanged",
                "accountsChanged",
                "disconnect",
              ];

              const approvedNamespaces = {
                eip155: {
                  chains: [],
                  methods: supportedMethods,
                  events: supportedEvents,
                  accounts: [],
                },
              };

              if (requiredNamespaces.eip155) {
                const proposedChains = requiredNamespaces.eip155.chains || [];
                approvedNamespaces.eip155.chains = proposedChains.filter((chain) =>
                  supportedChains.includes(chain)
                );

                if (approvedNamespaces.eip155.chains.length === 0) {
                  throw new Error("Hiçbir desteklenen zincir bulunamadı");
                }

                const proposedMethods = requiredNamespaces.eip155.methods || [];
                approvedNamespaces.eip155.methods = proposedMethods.filter(
                  (method) => supportedMethods.includes(method)
                );

                const proposedEvents = requiredNamespaces.eip155.events || [];
                approvedNamespaces.eip155.events = proposedEvents.filter((event) =>
                  supportedEvents.includes(event)
                );

                approvedNamespaces.eip155.accounts =
                  approvedNamespaces.eip155.chains.map(
                    (chain) =>
                      `${chain}:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb`
                  );
              }

              console.log("Approved namespaces:", approvedNamespaces);

              const newSession = await walletKitInstance.approveSession({
                id,
                namespaces: approvedNamespaces,
              });
              console.log("Session approved:", newSession);
              setSession(newSession);
              setQrCodeUrl("");
            } catch (err) {
              console.error("Session proposal error:", err);
              setError("Oturum önerisi başarısız: " + err.message);
              await walletKitInstance.rejectSession({
                id,
                reason: getSdkError("USER_REJECTED"),
              });
            }
          });

          // Session authenticate olayını dinle (One-click Auth)
          walletKitInstance.on("session_authenticate", async (payload) => {
            try {
              console.log("Session authenticate payload:", payload);

              const { verifyContext } = payload;
              const validation = verifyContext.verified.validation;
              const origin = verifyContext.verified.origin;
              const isScam = verifyContext.verified.isScam;

              console.log("Verify API results:", { validation, origin, isScam });

              if (isScam) {
                const proceed = window.confirm(
                  `UYARI: Bu talep kötü niyetli bir domain (${origin}) tarafından gönderildi. Devam etmek riskli olabilir. Devam etmek istiyor musunuz?`
                );
                if (!proceed) {
                  throw new Error("Kullanıcı kötü niyetli domain nedeniyle talebi reddetti");
                }
              }

              switch (validation) {
                case "VALID":
                  break;
                case "INVALID":
                  const invalidProceed = window.confirm(
                    `UYARI: Talep, beklenen domain ile eşleşmiyor (Origin: ${origin}). Devam etmek riskli olabilir. Devam etmek istiyor musunuz?`
                  );
                  if (!invalidProceed) {
                    throw new Error("Kullanıcı domain eşleşmesi hatası nedeniyle talebi reddetti");
                  }
                  break;
                case "UNKNOWN":
                  const unknownProceed = window.confirm(
                    `UYARI: Talep doğrulanamadı (Origin: ${origin}). Devam etmek riskli olabilir. Devam etmek istiyor musunuz?`
                  );
                  if (!unknownProceed) {
                    throw new Error("Kullanıcı doğrulanamayan domain nedeniyle talebi reddetti");
                  }
                  break;
              }

              const supportedChains = ["eip155:56"];
              const supportedMethods = [
                "eth_accounts",
                "eth_requestAccounts",
                "eth_sendTransaction",
                "personal_sign",
              ];

              const authPayload = populateAuthPayload({
                authPayload: payload.params.authPayload,
                chains: supportedChains,
                methods: supportedMethods,
              });

              const wallet = new ethers.Wallet("YOUR_PRIVATE_KEY");
              const iss = `eip155:56:${wallet.address}`;

              const message = walletKitInstance.formatAuthMessage({
                request: authPayload,
                iss,
              });

              console.log("Authentication message:", message);
              const userApproved = window.confirm(
                `Lütfen bu mesajı onaylayın:\n${message}`
              );
              if (!userApproved) {
                throw new Error("Kullanıcı mesajı onaylamadı");
              }

              const signature = await wallet.signMessage(message);

              const auth = buildAuthObject(
                authPayload,
                {
                  t: "eip191",
                  s: signature,
                },
                iss
              );

              await walletKitInstance.approveSessionAuthenticate({
                id: payload.id,
                auths: [auth],
              });

              console.log("Session authenticate approved:", auth);
              setSession({ topic: payload.id, namespaces: authPayload });
              setQrCodeUrl("");
            } catch (err) {
              console.error("Session authenticate error:", err);
              setError("Kimlik doğrulama başarısız: " + err.message);
              await walletKitInstance.rejectSessionAuthenticate({
                id: payload.id,
                reason: getSdkError("USER_REJECTED"),
              });
            }
          });

          // Auth request olayını dinle (Verify API ile doğrulama)
          walletKitInstance.on("auth_request", async (authRequest) => {
            try {
              console.log("Auth request payload:", authRequest);

              const { verifyContext } = authRequest;
              const validation = verifyContext.verified.validation;
              const origin = verifyContext.verified.origin;
              const isScam = verifyContext.verified.isScam;

              console.log("Verify API results:", { validation, origin, isScam });

              if (isScam) {
                const proceed = window.confirm(
                  `UYARI: Bu talep kötü niyetli bir domain (${origin}) tarafından gönderildi. Devam etmek riskli olabilir. Devam etmek istiyor musunuz?`
                );
                if (!proceed) {
                  throw new Error("Kullanıcı kötü niyetli domain nedeniyle talebi reddetti");
                }
              }

              switch (validation) {
                case "VALID":
                  break;
                case "INVALID":
                  const invalidProceed = window.confirm(
                    `UYARI: Talep, beklenen domain ile eşleşmiyor (Origin: ${origin}). Devam etmek riskli olabilir. Devam etmek istiyor musunuz?`
                  );
                  if (!invalidProceed) {
                    throw new Error("Kullanıcı domain eşleşmesi hatası nedeniyle talebi reddetti");
                  }
                  break;
                case "UNKNOWN":
                  const unknownProceed = window.confirm(
                    `UYARI: Talep doğrulanamadı (Origin: ${origin}). Devam etmek riskli olabilir. Devam etmek istiyor musunuz?`
                  );
                  if (!unknownProceed) {
                    throw new Error("Kullanıcı doğrulanamayan domain nedeniyle talebi reddetti");
                  }
                  break;
              }

              setError("Auth request alındı, ancak işleme mantığı eklenmedi.");
            } catch (err) {
              console.error("Auth request error:", err);
              setError("Kimlik doğrulama talebi başarısız: " + err.message);
            }
          });

          // Session request olayını dinle
          walletKitInstance.on("session_request", async (event) => {
            const { topic, params, id } = event;
            const { request } = params;

            try {
              console.log("Session request:", event);
              const wallet = new ethers.Wallet("YOUR_PRIVATE_KEY");
              let response;

              switch (request.method) {
                case "personal_sign": {
                  const message = ethers.utils.toUtf8String(request.params[0]);
                  const signedMessage = await wallet.signMessage(message);
                  response = formatJsonRpcResult(id, signedMessage);
                  break;
                }
                case "eth_sendTransaction": {
                  const tx = request.params[0];
                  const signedTx = await wallet.signTransaction(tx);
                  response = formatJsonRpcResult(id, signedTx);
                  break;
                }
                default:
                  throw new Error(`Desteklenmeyen yöntem: ${request.method}`);
              }

              await walletKitInstance.respondSessionRequest({ topic, response });
            } catch (err) {
              const errorResponse = {
                id,
                jsonrpc: "2.0",
                error: {
                  code: 5000,
                  message: err.message,
                },
              };
              await walletKitInstance.respondSessionRequest({
                topic,
                response: errorResponse,
              });
            }
          });
        }
      } catch (err) {
        console.error("Setup WalletKit failed:", err);
        setError("WalletKit kurulumu başarısız: " + err.message);
        setIsLoading(false);
      }
    }

    setupWalletKit();
  }, []);

  // WalletConnect ile bağlanma
  const connectWallet = async () => {
    if (!walletKit) {
      setError("WalletKit başlatılmadı");
      return;
    }

    try {
      const { uri: newUri } = await walletKit.core.pairing.create();
      setUri(newUri);

      const qrCode = await QRCode.toDataURL(newUri);
      setQrCodeUrl(qrCode);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Bağlantı zaman aşımına uğradı")),
          30000
        )
      );
      await Promise.race([walletKit.pair({ uri: newUri }), timeoutPromise]);
    } catch (err) {
      console.error("Pairing error:", err);
      setError(`Cüzdan bağlantısı başarısız: ${err.message}`);
      setQrCodeUrl("");
    }
  };

  // Oturumu sonlandır
  const disconnectWallet = async () => {
    if (!walletKit || !session) return;

    try {
      await walletKit.disconnectSession({
        topic: session.topic,
        reason: getSdkError("USER_DISCONNECTED"),
      });
      setSession(null);
      setQrCodeUrl("");
      setUri("");
    } catch (err) {
      setError("Bağlantı kesme başarısız: " + err.message);
    }
  };

  // number 0 is not iterable hatasını önlemek için güvenli veri kontrolü
  const safeAccounts = Array.isArray(session?.namespaces?.eip155?.accounts)
    ? session.namespaces.eip155.accounts
    : [];

  return (
    <div className="container">
      <h1>WalletConnect Demo</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!session ? (
        <div>
          <button onClick={connectWallet} disabled={!walletKit || isLoading}>
            Cüzdanı Bağla
          </button>
          {qrCodeUrl && (
            <div>
              <h3>QR Kodu Tara</h3>
              <img src={qrCodeUrl} alt="QR Code" />
            </div>
          )}
        </div>
      ) : (
        <div>
          <p>Oturum bağlandı: {session.topic}</p>
          <p>Hesaplar: {safeAccounts.join(", ") || "Hesap yok"}</p>
          <button onClick={disconnectWallet}>Bağlantıyı Kes</button>
        </div>
      )}
    </div>
  );
};

export default WalletConnectButton;
