// src/bsc-presale-site/buyToken.js
import { ethers } from "ethers";

const CONTRACT_ADDRESS = "0x46e7BbAa94A5f223438D5d7Bd91A6DAB77Af4899";

const CONTRACT_ABI = [
  "function buyToken() public payable"
];

export async function buyToken(amountInBNB) {
  try {
    if (typeof window.ethereum === "undefined") {
      alert("Lütfen bir Web3 cüzdan (ör: MetaMask) yükleyin.");
      return;
    }

    if (!amountInBNB || isNaN(amountInBNB) || Number(amountInBNB) <= 0) {
      alert("Lütfen geçerli bir miktar girin.");
      return;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    const value = ethers.parseEther(amountInBNB.toString());

    const tx = await contract.buyToken({ value });
    console.log("İşlem gönderildi:", tx.hash);
    await tx.wait();
    console.log("İşlem onaylandı!");
    alert("İşlem başarılı!");

  } catch (err) {
    console.error("Hata:", err);
    alert("İşlem başarısız: " + err.message);
  }
}

