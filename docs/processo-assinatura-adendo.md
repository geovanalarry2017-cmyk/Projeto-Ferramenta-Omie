# Processo de assinatura do adendo LGPD (manual, via DocuSign)

Passo a passo para cada cliente novo, do envio do adendo até o cliente ficar
ativo no sistema. Sem integração de código — usa o site do DocuSign
diretamente. O adendo em si é o template em
[`.claude/skills/lgpd-conciliador/assets/adendo-lgpd-operador.md`](../.claude/skills/lgpd-conciliador/assets/adendo-lgpd-operador.md).

---

## 1. Preencher o adendo para o cliente

1. Copie o conteúdo de `assets/adendo-lgpd-operador.md`.
2. Preencha os campos `«…»` que restam:
   - **Controlador**: razão social e CNPJ do cliente.
   - **Operador**: continua pendente até você constituir a PJ — deixe como
     está por enquanto (ou consulte um contador sobre a melhor forma de
     contratar enquanto isso).
3. Remova as notas em bloco de citação (as linhas que começam com `>`).
4. Exporte como PDF. Caminho mais simples: cole o texto num Google Docs ou
   Word, ajuste a formatação básica (títulos, tabelas) e exporte/baixe como
   PDF.

## 2. Enviar para assinatura no DocuSign

1. Entre em [docusign.com](https://www.docusign.com) com sua conta.
2. **New** → **Send an Envelope** (ou "Enviar um envelope").
3. Faça upload do PDF do adendo.
4. Adicione os signatários:
   - O representante legal do **Controlador** (cliente) — campo de assinatura
     na linha "Controlador: ______".
   - Você, como **Operador** — campo de assinatura na linha
     "Operador: ______" (o DocuSign permite você assinar também, como parte
     do mesmo envelope).
5. Posicione os campos de assinatura/data nos lugares certos do PDF (o
   DocuSign detecta e sugere posições; confira contra o documento).
6. **Send**.

## 3. Acompanhar

O painel do DocuSign mostra o status do envelope: *Sent* → *Delivered* →
*Completed*. Ele também manda e-mail automático quando alguém assina.

## 4. Quando concluído

1. No DocuSign, abra o envelope completo e **baixe o PDF assinado**
   (certificado de assinatura incluso).
2. Guarde esse PDF num lugar seguro **fora do repositório de código** — é
   documento de cliente com dado pessoal (nome, assinatura, às vezes CPF do
   signatário), não pertence ao git. Uma pasta própria no Google Drive/OneDrive
   com acesso restrito serve.

## 5. Registrar o aceite no sistema

Com o PDF assinado em mãos, ative o cliente (local, apontando para a
`DATABASE_URL` de produção, ou onde for mais conveniente):

```sh
# Se o cliente ainda não existe no sistema:
npm run clientes -- criar --slug <slug> --nome "<Razão Social>"

# Depois que o adendo estiver assinado:
npm run clientes -- aceite --cliente <slug> --versao v2
```

`--versao` é a versão do adendo que foi de fato assinada (hoje: `v2` — ver
`assets/adendo-lgpd-operador.md`, seção 9). A data do aceite é gravada
automaticamente pelo comando; não precisa (e não deve) ser digitada.

O comando `aceite` também ativa o cliente — a partir daí ele aparece em
`GET /clientes` e o dashboard já busca os dados dele na Omie.

---

## Notas

- **Quem assina primeiro não importa** — o registro no sistema só acontece
  depois que **ambos** os lados assinaram (envelope *Completed*).
- **Nunca** rode `clientes -- aceite` sem ter o PDF assinado em mãos — é o
  registro que sua empresa está cumprindo a LGPD como operador; registrar sem
  a assinatura de fato existir invalida essa proteção.
- Se o cliente pedir para renegociar uma cláusula: qualquer mudança de texto
  vira um adendo diferente — trate como uma nova versão (`v3`, etc.), não
  edite o PDF já enviado.
