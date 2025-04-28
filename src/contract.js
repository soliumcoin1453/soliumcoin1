import Web3 from 'web3';
import { config } from './config';

export const getContract = (provider) => {
  const web3 = new Web3(provider);
  return new web3.eth.Contract(config.contractABI, config.contractAddress);
};

export const buyTokens = async (provider, account, bnbAmount) => {
  try {
    const contract = getContract(provider);
    const weiAmount = Web3.utils.toWei(bnbAmount.toString(), 'ether');
    const tx = await contract.methods.buyTokens().send({
      from: account,
      value: weiAmount,
    });
    return tx;
  } catch (error) {
    throw new Error('buy error: ' + error.message);
  }
};

export const getContractInfo = async (provider) => {
  try {
    const contract = getContract(provider);
    const totalBNB = await contract.methods.getTotalBNB().call(); // Ham değer
    const remainingTokens = await contract.methods.getRemainingTokens().call(); // Ham değer
    return {
      totalBNB: Web3.utils.fromWei(totalBNB, 'ether'),
      remainingTokens: Web3.utils.fromWei(remainingTokens, 'ether')
    };
  } catch (error) {
    throw new Error('Bilgi çekme hatası: ' + error.message);
  }
};
