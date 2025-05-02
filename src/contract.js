import { ethers } from "ethers";

// Kontrat adresini ve ABI'yı güncelledim
const CONTRACT_ADDRESS = "0x42395Db998595DC7256aF2a6f10DC7b2E6006993";
const CONTRACT_ABI = [
  {
    "inputs": [],
    "name": "buyToken",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "remainingTokens",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalBNB",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

export async function getContractInfo(provider) {
  try {
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const [totalBNB, remainingTokens] = await Promise.all([
      contract.totalBNB(),
      contract.remainingTokens()
    ]);
    
    return {
      totalBNB: ethers.formatEther(totalBNB),
      remainingTokens: ethers.formatEther(remainingTokens)
    };
  } catch (error) {
    console.error("Contract info error:", error);
    throw new Error("Failed to fetch contract info");
  }
}

export async function buyTokens(provider, account, bnbAmount) {
  try {
    if (!provider || !account) {
      throw new Error("Wallet not connected");
    }

    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    
    const tx = await contract.buyToken({
      value: ethers.parseEther(bnbAmount.toString()),
      gasLimit: 300000 // Gas limit ekledim
    });
    
    const receipt = await tx.wait();
    return receipt;
  } catch (error) {
    console.error("Buy tokens error:", error);
    throw error;
  }
}
