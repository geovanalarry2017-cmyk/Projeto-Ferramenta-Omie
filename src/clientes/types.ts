/** Credenciais da Omie de um cliente. Nunca vao para log nem para o .env. */
export interface CredenciaisOmie {
  appKey: string;
  appSecret: string;
}

/** Credenciais do Pluggy de um cliente (modelo B: cada cliente tem a sua). */
export interface CredenciaisPluggy {
  clientId: string;
  clientSecret: string;
}

/** De/para entre uma conta do Pluggy e a conta corrente correspondente na Omie. */
export interface ContaDoCliente {
  id: number;
  apelido: string;
  pluggyAccountId: string;
  omieCodigoContaCorrente: number;
  ativo: boolean;
}

/** Cliente sem credencial nenhuma — seguro para listar, logar e devolver na API. */
export interface ClienteResumo {
  id: number;
  slug: string;
  nome: string;
  ativo: boolean;
  criadoEm: Date;
  /** Versao do adendo LGPD de operador assinado, ou null enquanto pendente. */
  adendoLgpdVersao: string | null;
  /** Quando o aceite do adendo foi registrado, ou null enquanto pendente. */
  adendoLgpdAceitoEm: Date | null;
}

/**
 * Cliente com as credenciais ja decifradas, pronto para uso.
 * So deve existir em memoria, pelo tempo de uma operacao. Nao serializar.
 */
export interface ClienteComCredenciais extends ClienteResumo {
  omie: CredenciaisOmie;
  pluggy: CredenciaisPluggy;
  contas: ContaDoCliente[];
}

export interface NovoCliente {
  slug: string;
  nome: string;
  omie: CredenciaisOmie;
  pluggy: CredenciaisPluggy;
}
