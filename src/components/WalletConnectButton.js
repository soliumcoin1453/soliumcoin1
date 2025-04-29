import React, { useState, useEffect } from 'react';
import { createWalletKit } from './WalletKitUtil';
import { config } from '../config';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import { ethers } from 'ethers';
import './styles.css';

const WalletConnectButton = ({ setProvider, setAccount }) => {
  const [account, setLocalAccount] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showWalletPopup, setShowWalletPopup] = useState(false);

  const isMobileDevice = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  const connectWithWalletConnect = async () => {
    setIsConnecting(true);
    setShowWalletPopup(true);
    setErrorMessage('');

    let walletkit;
    try {
      console.log('Initializing WalletKit...');
      walletkit = await createWalletKit();
      console.log('WalletKit initialized:', walletkit);

      // Eski eşleştirmeleri temizle
      console.log('Cleaning up old pairings...');
      const pairings = await walletkit.engine.signClient.core.pairing.getPairings();
      console.log('Found pairings:', pairings);
      for (const pairing of pairings) {
        await walletkit.engine.signClient.core.pairing.disconnect({ topic: pairing.topic });
        console.log('Disconnected pairing:', pairing.topic);
      }

      // Eski oturumları temizle
      console.log('Cleaning up old sessions...');
      const activeSessions = walletkit.getActiveSessions();
      console.log('Active sessions:', activeSessions);
      if (activeSessions && Object.keys(activeSessions).length > 0) {
        for (const session of Object.values(activeSessions)) {
          await walletkit.disconnectSession({
            topic: session.topic,
            reason: getSdkError('USER_DISCONNECTED'),
          });
          console.log('Disconnected session:', session.topic);
        }
      }

      // Ek olay dinleyicileri
      console.log('Setting up all event listeners...');
      walletkit.engine.signClient.events.on('session_event', (event) => {
        console.log('General session event:', event);
      });
      walletkit.engine.signClient.events.on('session_ping', (event) => {
        console.log('Session ping event:', event);
      });
      walletkit.engine.signClient.events.on('session_update', (event) => {
        console.log('Session update event:', event);
      });

      // Oturum önerisi dinleyici
      walletkit.on('session_proposal', async ({ id, params }) => {
        console.log('Session proposal received:', params);
        try {
          const approvedNamespaces = buildApprovedNamespaces({
            proposal: params,
            supportedNamespaces: {
              eip155: {
                chains: [`eip155:${config.chainId}`],
                methods: [
                  'eth_accounts',
                  'eth_requestAccounts',
                  'eth_sendRawTransaction',
                  'eth_sign',
                  'eth_signTransaction',
                  'eth_sendTransaction',
                  'personal_sign',
                  'wallet_switchEthereumChain',
                  'wallet_addEthereumChain',
                ],
                events: ['chainChanged', 'accountsChanged'],
                accounts: [],
              },
            },
          });

          const session = await walletkit.approveSession({
            id,
            namespaces: approvedNamespaces,
          });
          console.log('Session approved:', session);

          const accounts = await walletkit.engine.signClient.request({
            topic: session.topic,
            chainId: `eip155:${config.chainId}`,
            request: { method: 'eth_accounts', params: [] },
          });
          console.log('Connected accounts:', accounts);

          const provider = new ethers.providers.Web3Provider(walletkit);
          setLocalAccount(accounts[0]);
          setProvider(provider);
          setAccount(accounts[0]);
          setShowWalletPopup(false);
          setQrCodeUrl('');
          setErrorMessage('');

          localStorage.setItem(
            'walletConnection',
            JSON.stringify({
              account: accounts[0],
            })
          );
        } catch (error) {
          console.error('Session proposal error:', error);
          await walletkit.rejectSession({
            id,
            reason: getSdkError('USER_REJECTED'),
          });
          setErrorMessage(`Session proposal error: ${error.message}`);
          setShowWalletPopup(false);
          setIsConnecting(false);
        }
      });

      // Oturum hata ve olay dinleyicileri
      walletkit.on('session_error', (error) => {
        console.error('Session error:', error);
        setErrorMessage(`Session error: ${error.message}`);
      });
      walletkit.on('session_delete', () => {
        console.log('Session deleted');
        setErrorMessage('Session deleted by wallet');
        setLocalAccount(null);
        setProvider(null);
        setAccount(null);
      });
      walletkit.on('session_expire', () => {
        console.log('Session expired');
        setErrorMessage('Session expired');
      });

      // Oturum isteği dinleyici
      walletkit.on('session_request', async (event) => {
        const { topic, params, id } = event;
        const { request } = params;
        try {
          if (request.method === 'personal_sign') {
            const message = ethers.utils.toUtf8String(request.params[0]);
            const provider = new ethers.providers.Web3Provider(walletkit);
            const signer = provider.getSigner();
            const signature = await signer.signMessage(message);
            await walletkit.respondSessionRequest({
              topic,
              response: { id, result: signature, jsonrpc: '2.0' },
            });
          } else if (request.method === 'eth_signTransaction') {
            const provider = new ethers.providers.Web3Provider(walletkit);
            const signer = provider.getSigner();
            const signature = await signer.signTransaction(request.params[0]);
            await walletkit.respondSessionRequest({
              topic,
              response: { id, result: signature, jsonrpc: '2.0' },
            });
          } else {
            await walletkit.respondSessionRequest({
              topic,
              response: {
                id,
                jsonrpc: '2.0',
                error: { code: 5000, message: 'Unsupported method' },
              },
            });
          }
        } catch (error) {
          console.error('Session request error:', error);
          await walletkit.respondSessionRequest({
            topic,
            response: {
              id,
              jsonrpc: '2.0',
              error: { code: 5000, message: `Request failed: ${error.message}` },
            },
          });
        }
      });

      // Yeni eşleştirme oluştur
      console.log('Creating new pairing...');
      const pairing = await walletkit.engine.signClient.core.pairing.create();
      const uri = pairing.uri;

      if (!uri || typeof uri !== 'string' || !uri.startsWith('wc:')) {
        throw new Error('Invalid pairing URI');
      }
      console.log('Pairing created, QR URI:', uri);

      // Mobil cihaz için URI’yi doğrudan ayarla
      setQrCodeUrl(uri);

      // Oturum onayını bekle
      console.log('Waiting for session approval via session_proposal...');
    } catch (error) {
      console.error('WalletConnect error:', error);
      setErrorMessage(`WalletConnect error: ${error.message || 'Unknown error'}`);
      setQrCodeUrl('');
      setShowWalletPopup(false);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    let walletkit;
    try {
      walletkit = await createWalletKit();
      const activeSessions = walletkit.getActiveSessions();
      if (activeSessions && Object.keys(activeSessions).length > 0) {
        for (const session of Object.values(activeSessions)) {
          await walletkit.disconnectSession({
            topic: session.topic,
            reason: getSdkError('USER_DISCONNECTED'),
          });
          console.log('Disconnected session:', session.topic);
        }
      }
      localStorage.removeItem('walletConnection');
      setLocalAccount(null);
      setProvider(null);
      setAccount(null);
      setErrorMessage('');
      setQrCodeUrl('');
      setShowWalletPopup(false);
    } catch (error) {
      console.error('Disconnect error:', error);
      setErrorMessage(`Disconnect error: ${error.message || 'Unknown error'}`);
    }
  };

  const handleMobileConnect = (walletType) => {
    if (!qrCodeUrl || !qrCodeUrl.startsWith('wc:')) {
      setErrorMessage('Invalid or missing URI. Please try again.');
      return;
    }

    const deepLinks = {
      metamask: `https://metamask.app.link/wc?uri=${encodeURIComponent(qrCodeUrl)}`,
      trust: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(qrCodeUrl)}`,
    };
    const selectedLink = deepLinks[walletType];
    if (selectedLink) {
      console.log('Redirecting to:', selectedLink);
      window.location.href = selectedLink;
    } else {
      setErrorMessage('No deeplink found for selected wallet.');
    }
  };

  useEffect(() => {
    const connectionData = localStorage.getItem('walletConnection');
    if (connectionData) {
      connectWithWalletConnect();
    }
  }, [setProvider, setAccount]);

  return (
    <div className="wallet-connect-container">
      {errorMessage && <div style={{ color: 'red', marginBottom: '10px' }}>{errorMessage}</div>}
      {account ? (
        <div className="connected-wallet">
          <p>
            <strong>Connected Address:</strong> {account.slice(0, 6)}...{account.slice(-4)}
          </p>
          <button className="disconnect-button" onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <div className="connect-buttons">
          <button
            className="connect-button walletconnect-button"
            onClick={connectWithWalletConnect}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Connect with WalletConnect'}
          </button>
        </div>
      )}
      {showWalletPopup && (
        <div className="custom-wallet-modal">
          <div className="custom-wallet-modal-content">
            <button
              className="custom-wallet-modal-close"
              onClick={() => {
                setShowWalletPopup(false);
                setQrCodeUrl('');
              }}
            >
              ✕
            </button>
            <h2>Connect with Wallet</h2>
            <div className="wallet-options">
              {isMobileDevice() ? (
                <div className="button-section">
                  <button
                    className="mobile-button"
                    onClick={() => handleMobileConnect('metamask')}
                  >
                    MetaMask (Mobile)
                  </button>
                  <button
                    className="mobile-button"
                    onClick={() => handleMobileConnect('trust')}
                  >
                    Trust Wallet (Mobile)
                  </button>
                </div>
              ) : (
                <div className="qr-code-section">
                  <h3>Scan QR Code</h3>
                  {qrCodeUrl && (
                    <img src={qrCodeUrl} alt="WalletConnect QR Code" className="custom-qr-code" />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletConnectButton;
