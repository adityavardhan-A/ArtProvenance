/**
 * Deploys ImageRegistry to Sepolia and records the address in
 * deployments/sepolia.json, which both the backend and the frontend read.
 *
 *   npx hardhat compile
 *   node --import tsx scripts/deploy.ts      (or: npx tsx scripts/deploy.ts)
 *
 * Requires SEPOLIA_RPC_URL (or VITE_PUBLIC_SEPOLIA_RPC_URL) and PRIVATE_KEY
 * in project/.env, and a funded Sepolia account.
 */
import { ethers } from "ethers";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const ARTIFACT_PATH = resolve(
  projectRoot,
  "artifacts/contracts/ImageRegistry.sol/ImageRegistry.json"
);
const DEPLOYMENTS_DIR = resolve(projectRoot, "deployments");
const DEPLOYMENT_FILE = resolve(DEPLOYMENTS_DIR, "sepolia.json");

async function main() {
  const rpcUrl =
    process.env.SEPOLIA_RPC_URL || process.env.VITE_PUBLIC_SEPOLIA_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;

  const cleanKey = (privateKey || "").trim().replace(/^0x/, "");
  const isValidKey = /^[0-9a-fA-F]{64}$/.test(cleanKey);

  if (!rpcUrl) {
    throw new Error(
      "Missing SEPOLIA_RPC_URL (or VITE_PUBLIC_SEPOLIA_RPC_URL) in project/.env"
    );
  }
  if (!isValidKey) {
    throw new Error(
      "Missing or invalid PRIVATE_KEY in project/.env. Please set a valid 64-character hex private key holding Sepolia ETH."
    );
  }
  if (!existsSync(ARTIFACT_PATH)) {
    throw new Error(
      `Artifact not found at ${ARTIFACT_PATH}. Run "npx hardhat compile" first.`
    );
  }

  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  const network = await provider.getNetwork();
  const balance = await provider.getBalance(signer.address);

  console.log(`Network:  ${network.name} (chainId ${network.chainId})`);
  console.log(`Deployer: ${signer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error(
      "Deployer has no ETH. Fund it from a Sepolia faucet before deploying."
    );
  }

  console.log("\nDeploying ImageRegistry...");
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    signer
  );

  const contract = await factory.deploy();
  const deployTx = contract.deploymentTransaction();
  console.log(`Tx hash:  ${deployTx?.hash}`);

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const receipt = deployTx ? await deployTx.wait() : null;

  const record = {
    contractName: "ImageRegistry",
    address,
    chainId: Number(network.chainId),
    deployer: signer.address,
    transactionHash: deployTx?.hash ?? null,
    blockNumber: receipt?.blockNumber ?? null,
    deployedAt: new Date().toISOString(),
  };

  mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  writeFileSync(DEPLOYMENT_FILE, JSON.stringify(record, null, 2) + "\n");

  console.log(`\n✅ ImageRegistry deployed to: ${address}`);
  console.log(`   Block:     ${record.blockNumber}`);
  console.log(`   Etherscan: https://sepolia.etherscan.io/address/${address}`);
  console.log(`   Written:   deployments/sepolia.json`);
  console.log(
    `\nAdd this to project/.env so the frontend picks it up:\n   VITE_CONTRACT_ADDRESS=${address}\n`
  );
}

main().catch((error) => {
  console.error("\n❌ Deployment failed:", error.message ?? error);
  process.exitCode = 1;
});
