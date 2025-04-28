import React, { useState } from 'react';
import { Core } from '@walletconnect/core';
import { WalletKit, WalletKitTypes } from '@reown/walletkit';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import { ethers } from 'ethers';
import './styles.css';

const WalletConnectButton = ({ setProvider, setAccount }) => {
  const [account, setLocalAccount] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showWalletPopup, setShowWalletPopup] = useState(false);

  // Mobil cihaz kontrolü
  const isMobileDevice = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  // WalletConnect ile bağlantı fonksiyonu
  const connectWithWalletConnect = async () => {
    setIsConnecting(true);
    setShowWalletPopup(true);
    setErrorMessage('');

    try {
      console.log('WalletConnect başlatılıyor...');
      const core = new Core({
        projectId: process.env.REACT_APP_PROJECT_ID,
        relayUrl: 'wss://relay.walletconnect.org', // Varsayılan relay
      });
      console.log('Core başlatıldı, projectId:', process.env.REACT_APP_PROJECT_ID);

      const walletKit = await WalletKit.init({
        core,
        metadata: {
          name: 'Demo App',
          description: 'Basit WalletConnect Demo',
          url: 'https://your-app-url.com',
          icons: [],
        },
      });
      console.log('WalletKit başlatıldı');

      walletKit.on('session_proposal', async ({ id, params }) => {
        console.log('Oturum önerisi alındı:', { id, params });
        try {
          const approvedNamespaces = buildApprovedNamespaces({
            proposal: params,
            supportedNamespaces: {
              eip155: {
                chains: ['eip155:1'], // Ethereum Mainnet
                methods: ['eth_accounts', 'personal_sign'],
                events: ['chainChanged', 'accountsChanged'],
                accounts: [],
              },
            },
          });

          console.log('Namespaces oluşturuldu:', approvedNamespaces);
          const session = await walletKit.approveSession({
            id,
            namespaces: approvedNamespaces,
          });
          console.log('Oturum onaylandı:', session);

          const accounts = await walletKit.engine.signClient.request({
            topic: session.topic,
            chainId: 'eip155:1',
            request: { method: 'eth_accounts', params: [] },
          });
          console.log('Hesaplar alındı:', accounts);

          const provider = new ethers.providers.Web3Provider(walletKit);
          setLocalAccount(accounts[0]);
          setProvider(provider);
          setAccount(accounts[0]);
          setShowWalletPopup(false);
          setQrCodeUrl('');
          setIsConnecting(false);
        } catch (error) {
          console.error('Oturum onaylama hatası:', error);
          await walletKit.rejectSession({
            id,
            reason: getSdkError('USER_REJECTED'),
          });
          setErrorMessage('Oturum onaylanamadı: ' + error.message);
          setShowWalletPopup(false);
          setIsConnecting(false);
        }
      });

      console.log('Eşleştirme oluşturuluyor...');
      const pairing = await walletKit.engine.signClient.core.pairing.create();
      const uri = pairing.uri;
      console.log('Eşleştirme URI’si:', uri);
      setQrCodeUrl(uri);

      if (isMobileDevice()) {
        console.log('Mobil cihaz tespit edildi, MetaMask deep link yönlendirmesi...');
        handleMobileConnect('metamask');
      }
    } catch (error) {
      console.error('WalletConnect hatası:', error);
      setErrorMessage('Bağlantı hatası: ' + error.message);
      setQrCodeUrl('');
      setShowWalletPopup(false);
      setIsConnecting(false);
    }
  };

  // Bağlantıyı kesme fonksiyonu
  const handleDisconnect = async () => {
    try {
      const core = new Core({
        projectId: process.env.REACT_APP_PROJECT_ID,
        relayUrl: 'wss://relay.walletconnect.org',
      });
      const walletKit = await WalletKit.init({ core });
      const activeSessions = walletKit.getActiveSessions();
      for (const session of Object.values(activeSessions)) {
        await walletKit.disconnectSession({
          topic: session.topic,
          reason: getSdkError('USER_DISCONNECTED'),
        });
      }
      setLocalAccount(null);
      setProvider(null);
      setAccount(null);
      setErrorMessage('');
    } catch (error) {
      console.error('Bağlantı kesme hatası:', error);
      setErrorMessage('Bağlantı kesme hatası: ' + error.message);
    }
  };

  // Mobil deep link yönlendirme
  const handleMobileConnect = (walletType) => {
    const deepLinks = {
      metamask: `https://metamask.app.link/wc?uri=${encodeURIComponent(qrCodeUrl)}`,
      trust: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(qrCodeUrl)}`,
    };
    const selectedLink = deepLinks[walletType];
    if (selectedLink) {
      window.location.href = selectedLink;
    } else {
      setErrorMessage('Seçilen cüzdan için deep link bulunamadı.');
    }
  };

  return (
    <div className="wallet-connect-container">
      {errorMessage && <div style={{ color: 'red', marginBottom: '10px' }}>{errorMessage}</div>}
      {account ? (
        <div className="connected-wallet">
          <p>
            <strong>Bağlı Adres:</strong> {account.slice(0, 6)}...{account.slice(-4)}
          </p>
          <button className="disconnect-button" onClick={handleDisconnect}>
            Bağlantıyı Kes
          </button>
        </div>
      ) : (
        <div className="connect-buttons">
          <button
            className="connect-button walletconnect-button"
            onClick={connectWithWalletConnect}
            disabled={isConnecting}
          >
            {isConnecting ? 'Bağlanıyor...' : 'WalletConnect ile Bağlan'}
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
            <h2>Cüzdan ile Bağlan</h2>
            <div className="wallet-options">
              {isMobileDevice() ? (
                <div className="button-section">
                  <button
                    className="mobile-button"
                    onClick={() => handleMobileConnect('metamask')}
                  >
                    MetaMask (Mobil)
                  </button>
                  <button
                    className="mobile-button"
                    onClick={() => handleMobileConnect('trust')}
                  >
                    Trust Wallet (Mobil)
                  </button>
                </div>
              ) : (
                <div className="qr-code-section">
                  <h3>QR Kodu Tara</h3>
                  {qrCodeUrl && (
                    <img src={qrCodeUrl} alt="WalletConnect QR Kodu" className="custom-qr-code" />
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
