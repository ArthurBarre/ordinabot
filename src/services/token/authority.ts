import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TokenAuthorityStatus } from '../../core/types';

export class TokenAuthorityService {
  private connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl);
  }

  public async getTokenAuthorities(mintAddress: string): Promise<TokenAuthorityStatus> {
    try {
      const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(mintAddress));

      if (!mintInfo.value || !mintInfo.value.data || typeof mintInfo.value.data !== 'object') {
        throw new Error('Invalid mint account data');
      }

      const data = mintInfo.value.data;
      if ('parsed' in data && data.parsed.type === 'mint') {
        const { mintAuthority, freezeAuthority } = data.parsed.info;

        return {
          isSecure: !mintAuthority && !freezeAuthority,
          hasMintAuthority: !!mintAuthority,
          hasFreezeAuthority: !!freezeAuthority,
        };
      }

      throw new Error('Invalid mint account data format');
    } catch (error) {
      console.error('Error getting token authorities:', error);
      return {
        isSecure: false,
        hasMintAuthority: true,
        hasFreezeAuthority: true,
      };
    }
  }
} 