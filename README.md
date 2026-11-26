# export-reconcile

Compara duas exportações de clientes (por exemplo, ERP e CRM) e lista onde elas divergem.

Demo independente, sem vínculo com a Technomotive. Independent demo, not affiliated with Technomotive. Todos os dados do repositório são inventados.

## O problema

Quando um ERP e um CRM guardam os mesmos clientes, as listas se afastam aos poucos. O mesmo CNPJ aparece com pontos e barra num lado e só com dígitos no outro. Um nome ganha acento. Alguém digita um dígito errado. Um join por texto puro chama tudo isso de "cliente faltando" e esconde as diferenças reais.

Esta ferramenta normaliza a chave antes de comparar, valida os dígitos verificadores do CNPJ e separa o que é só formatação do que é diferença de verdade.

## O que ela faz

- Lê dois CSVs e casa as linhas pela chave (`cnpj`, `email`, `digits` ou `text`).
- Lista registros que existem só de um lado.
- Lista chaves duplicadas (o mesmo CNPJ escrito de dois jeitos conta como duplicata).
- Lista chaves vazias ou com dígito verificador inválido.
- Compara campos escolhidos, ignorando maiúsculas, acentos, pontuação e sufixos como LTDA.
- Sai com código 1 quando acha diferença, então serve numa checagem agendada.

## Como rodar

Precisa de Node 20 ou mais novo. Não há dependências.

```sh
git clone https://github.com/lucas-saldanha-werneck/export-reconcile.git
cd export-reconcile
node src/cli.mjs --left examples/erp.csv --right examples/crm.csv \
  --key cnpj --key-kind cnpj --fields name,email:email,city
```

Use `--json` para a saída em JSON e `--right-key` se a coluna tiver outro nome no segundo arquivo.

## Resultado no exemplo

Nos CSVs de exemplo (10 linhas de cada lado), um join por texto puro aponta 5 clientes do ERP como faltando no CRM. Depois de normalizar, são 3. As outras 2 diferenças eram só formatação. Também aparecem:

- 1 CNPJ duplicado no CRM (linhas 5 e 6, escrito de dois jeitos);
- 2 CNPJs com dígito verificador inválido no CRM;
- 2 campos que mudaram de verdade (cidade e e-mail).

## O que foi testado

- `npm test` roda 7 testes com `node --test`, sem rede: leitor de CSV (aspas, vírgulas, CRLF, BOM), validação de CNPJ, normalização, os números acima nos CSVs de exemplo, chave vazia e o código de saída da linha de comando.
- O CI do GitHub roda os mesmos testes.

## O que não foi testado

- Nenhum dado real. Os CNPJs de exemplo passam na conta dos dígitos, mas são inventados.
- Arquivos grandes. O código carrega tudo em memória e não foi medido com milhares de linhas.
- CSV com separador diferente de vírgula, ou com quebra de linha dentro de campo entre aspas em arquivos muito grandes.
- Conexão direta com a API de algum ERP ou CRM. A entrada é só CSV.
- Casamento aproximado de nomes (erros de digitação no nome). A chave precisa bater depois da normalização.
