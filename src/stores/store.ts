import { defineStore } from "pinia"
import { ref, computed } from 'vue'
import { Wallet, TestNetWallet, BaseWallet, Config, BalanceResponse, UtxoI } from "mainnet-js"
import { IndexedDBProvider } from "@mainnet-cash/indexeddb-storage"
import type { TokenList } from "../interfaces/interfaces"
import { useSettingsStore } from './settingsStore'
import { queryAuthHead } from "../queryChainGraph"
import { getAllNftTokenBalances, getFungibleTokenBalances } from "src/utils/utils"
const settingsStore = useSettingsStore()

// set mainnet-js config
Config.EnforceCashTokenReceiptAddresses = true;
BaseWallet.StorageProvider = IndexedDBProvider;

const explorerUrlMainnet = "https://explorer.bitcoinunlimited.info";
const explorerUrlChipnet = "https://chipnet.chaingraph.cash";

export const useStore = defineStore('store', () => {
  // Wallet State
  const wallet = ref(null as (Wallet |TestNetWallet | null));
  const balance = ref(undefined as (BalanceResponse | undefined));
  const maxAmountToSend = ref(undefined as (BalanceResponse | undefined));
  const network = computed(() => wallet.value?.network == "mainnet" ? "mainnet" : "chipnet")
  const explorerUrl = computed(() => network.value == "mainnet" ? explorerUrlMainnet : explorerUrlChipnet);
  const tokenList = ref(null as (TokenList| null))
  const plannedTokenId = ref(undefined as (undefined | string));
  const nrBcmrRegistries = ref(undefined as (number | undefined));

  async function updateTokenList(){
    if(!wallet.value) return // should never happen
    const tokenUtxos = await wallet.value.getTokenUtxos();
    const fungibleTokensResult = getFungibleTokenBalances(tokenUtxos);
    const nftsResult = getAllNftTokenBalances(tokenUtxos);
    if(!fungibleTokensResult || !nftsResult) return // should never happen
    const arrayTokens:TokenList = [];
    for (const tokenId of Object.keys(fungibleTokensResult)) {
      arrayTokens.push({ tokenId, amount: fungibleTokensResult[tokenId] });
    }
    for (const tokenId of Object.keys(nftsResult)) {
      const utxosNftTokenid = tokenUtxos.filter((val) =>val.token?.tokenId === tokenId);
      arrayTokens.push({ tokenId, nfts: utxosNftTokenid });
    }
    tokenList.value = arrayTokens;
    const catgeories = Object.keys({...fungibleTokensResult, ...nftsResult})
    return catgeories;
  }

  async function fetchAuthUtxos(){
    if(!wallet.value) return // should never happen
    if(!tokenList.value?.length) return
    const copyTokenList = tokenList.value
    const authHeadTxIdPromises: any[] = [];
    const tokenUtxosPromises: any[] = [];
    for (const token of tokenList.value){
      authHeadTxIdPromises.push(queryAuthHead(token.tokenId, settingsStore.chaingraph))
      tokenUtxosPromises.push(wallet.value.getTokenUtxos(token.tokenId));
    }
    const authHeadTxIdResults: string[] = await Promise.all(authHeadTxIdPromises);
    const tokenUtxosResults: UtxoI[][] = await Promise.all(tokenUtxosPromises);
    tokenUtxosResults.forEach((tokenUtxos, index) => {
      const authHeadTxId = authHeadTxIdResults[index];
      const authUtxo = tokenUtxos.find(utxo => utxo.txid == authHeadTxId && utxo.vout == 0);
      if(authUtxo) copyTokenList[index].authUtxo = authUtxo;
    })
    tokenList.value = copyTokenList;
  }

  return { wallet, balance, maxAmountToSend, network, explorerUrl, tokenList, updateTokenList, fetchAuthUtxos, plannedTokenId, nrBcmrRegistries }
})