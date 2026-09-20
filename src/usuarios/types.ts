/** Usuario sem a senha — seguro para listar, logar e devolver na API. */
export interface UsuarioResumo {
  id: number;
  clienteId: number;
  email: string;
  ativo: boolean;
  criadoEm: Date;
}

/**
 * Usuario com o hash da senha, para o momento de conferir login.
 * So deve existir em memoria, pelo tempo da checagem. Nao serializar.
 */
export interface UsuarioComHash extends UsuarioResumo {
  senhaHash: string;
}

export interface NovoUsuario {
  clienteId: number;
  email: string;
  /** Senha em texto puro — vira hash antes de tocar o banco. */
  senha: string;
}
