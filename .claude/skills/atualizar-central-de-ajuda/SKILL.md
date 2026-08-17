---
name: atualizar-central-de-ajuda
description: Use SEMPRE que uma mudança de usabilidade for feita no EclesiaSync — nova tela/página, novo item de menu, novo tipo de evento, campo de formulário adicionado/removido/renomeado, mudança em permissões, fluxo ou textos de interface. Garante que a Central de Ajuda (HELP_DATA em app.js) reflita o comportamento atual do sistema. Triggers: "atualizei a tela", "adicionei/removi um campo", "novo evento", "mudei o menu", "central de ajuda", "tela de ajuda".
---

# Atualizar a Central de Ajuda do EclesiaSync

Objetivo: manter a **Central de Ajuda** sempre coerente com o que o sistema
realmente faz. Toda vez que a usabilidade muda (uma tela, um campo, um menu,
um tipo de evento, uma permissão, um texto de botão), a ajuda correspondente
precisa ser criada, atualizada ou removida na mesma tarefa.

## Onde a ajuda vive

- **Dados:** `const HELP_DATA = [...]` em [app.js](../../../app.js) (procure por `const HELP_DATA`).
  É um array de **categorias**; cada categoria tem `articles`; cada artigo tem `sections`.
- **Renderização / busca:** funções `openHelpCenter`, `renderHelpCenter`,
  `helpRenderHome`, `helpRenderCollection`, `helpRenderArticle`, `helpRenderSearch`
  no mesmo arquivo. A busca (`helpRenderSearch`) indexa título + descrição + o
  texto das seções (`h`, `p`, `list`), então o conteúdo escrito nas seções fica
  pesquisável.
- **Botão de abertura:** `openHelpCenter()` disparado pelo `#help-trigger` na
  topbar de [index.html](../../../index.html); o diálogo `#help-center` também
  fica no index.html.

## Formato de uma categoria

```js
{
  id: 'slug-unico', icon: 'nome-lucide', title: 'Título', desc: 'Subtítulo curto',
  articles: [
    {
      id: 'slug-artigo', title: 'Título do artigo', desc: 'Frase curta.',
      sections: [
        { icon: '💡', h: 'O que é', p: ['Parágrafo explicando.'] },
        { icon: '⏱️', h: 'Como fazer', list: ['Passo 1.', 'Passo 2.'] }
      ]
    }
  ]
}
```

Convenções observadas no arquivo (siga-as):
- Idioma **português do Brasil**, tom acolhedor, foco em quem usa e não em código.
- `icon` da categoria = ícone Lucide (ex.: `layout-dashboard`, `users`, `trending-up`).
- `icon` da seção = emoji. Padrões: `💡` "O que é", `⏱️` "Como fazer",
  `❓` dúvida comum, `🔒` permissão/segurança, `💰` financeiro.
- Uma seção usa `p: [...]` (parágrafos) **ou** `list: [...]` (passos), não os dois.
- Escreva o que o usuário vê na interface (nomes reais de botões, menus, campos).

## Procedimento (rodar a cada mudança de usabilidade)

1. **Entenda a mudança.** Identifique o que mudou na interface: tela, menu
   (`index.html` → `.sidebar-nav`), tipo de evento (`TIPOS_EVENTO` /
   `UMADALPE_TIPOS_*` em app.js), campo de formulário, permissão (`hasPerm`), texto.
2. **Localize a ajuda correspondente** em `HELP_DATA`. Cada página do menu deve
   ter uma categoria; cada funcionalidade relevante, um artigo.
3. **Aplique a mudança na ajuda:**
   - Recurso **novo** → novo artigo (ou nova categoria se for uma tela nova).
   - Recurso **alterado** → ajuste o texto do artigo/seção existente.
   - Recurso **removido** → remova o artigo/seção e qualquer menção a ele.
   - Mantenha `id` de categoria e de artigo **únicos** e em `kebab-case`.
4. **Confira a cobertura.** Faça uma varredura rápida: todo item do menu lateral
   tem categoria? Todo tipo de evento com campos próprios está descrito? Nenhum
   artigo cita um campo/botão que não existe mais?
5. **Valide** (ver abaixo) e não deixe a tarefa sem checar que a ajuda abre e
   busca corretamente.

## Validação

Verificação de sintaxe:

```bash
node --check app.js
```

Verificação funcional (com um servidor estático servindo o projeto, ex.
`npx --yes http-server -p 5500`), no console do navegador:

```js
// nº de categorias e artigos
HELP_DATA.map(c => c.id + ':' + c.articles.length)
// abre e confere que o corpo renderiza
openHelpCenter(); document.getElementById('help-body').innerHTML.length
// a busca encontra o novo termo?
helpSearch('SEU_TERMO_NOVO'); document.getElementById('help-body').innerText
```

Todos os `id` devem ser únicos e a busca por um termo escrito no novo conteúdo
deve retornar o artigo esperado.

## Regra de ouro

Uma mudança de usabilidade **não está concluída** enquanto a Central de Ajuda
não refletir o novo comportamento. Trate a atualização da ajuda como parte da
mesma entrega, nunca como um passo opcional posterior.
