import type { HardhatUserConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import "dotenv/config";

// The RPC URL is accepted under either name so that the browser build (which
// only sees VITE_* variables) and the Node tooling can share one .env file.
const RPC_URL =
  process.env.SEPOLIA_RPC_URL || process.env.VITE_PUBLIC_SEPOLIA_RPC_URL || "https://rpc.sepolia.org";

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  // Hardhat 3 registers plugins explicitly rather than by side-effect import.
  plugins: [hardhatEthers],
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url: RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};

export default config;
