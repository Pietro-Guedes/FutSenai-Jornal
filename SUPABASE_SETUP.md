# Configurar notícias, enquetes, prêmios, contas e previsões

O site usa o Supabase para publicar notícias e compartilhar votos e palpites. A URL e a chave `anon`/public do projeto são configurações públicas para uso no navegador; nunca coloque uma `service_role` key neste site.

## Ativar

1. Crie um projeto em [supabase.com](https://supabase.com/).
2. No painel do projeto, abra **SQL Editor**, cole o conteúdo atualizado de `supabase-setup.sql` e execute. Se já executou uma versão anterior, execute novamente para instalar também o banco e o armazenamento de imagens das notícias.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon/public**.
4. Cole esses dois valores em `supabase-config.js`, nos campos `url` e `anonKey`.
5. Em **Authentication → URL Configuration**, configure a URL do site publicado como **Site URL** e inclua-a em **Redirect URLs** para a confirmação de e-mail voltar ao site.
6. Para oferecer login Google, em **Authentication → Sign In / Providers → Google**, ative o provedor e informe o OAuth Client ID e Client Secret criados no Google Cloud. No cliente OAuth do Google, cadastre como URI de redirecionamento autorizado o callback exibido pelo Supabase (normalmente `https://<project-ref>.supabase.co/auth/v1/callback`). Mantenha a URL do site em **Redirect URLs** no Supabase.
7. Cadastre uma conta de editor em `news_admins` conforme as instruções abaixo; ela também poderá gerenciar enquetes, prêmios e jogos pelo painel.
8. Publique `index.html`, `admin.html`, `style.css`, `script.js`, `admin.js`, `interactions.js`, `supabase-config.js` e `noticias.json` junto às imagens do site.
9. Abra o site em `https://` ou em `http://localhost`; `file://` não funciona para as chamadas ao Supabase.

## Editar notícias

- Depois de executar a configuração SQL, crie uma conta no site e confirme o e-mail. Em **Authentication → Users**, copie o UUID dessa conta.
- Autorize a conta como editora pelo **SQL Editor**, substituindo o UUID:

  ```sql
  insert into public.news_admins (user_id)
  values ('COLE-AQUI-O-UUID-DA-CONTA')
  on conflict (user_id) do nothing;
  ```

- Acesse `admin.html` no site e entre com o e-mail e a senha dessa conta. A permissão é verificada no Supabase; outras contas podem entrar no site, mas não conseguem editar notícias.
- Na primeira visita ao painel, escolha **Importar noticias.json** e selecione o arquivo atual do site. Isso copia as matérias existentes para o banco sem apagar outras matérias já cadastradas. Depois, novas matérias, edições e exclusões são publicadas diretamente no site.
- Imagens escolhidas no computador são reduzidas e enviadas ao bucket público `news-images`. O bucket permite leitura pública das imagens, mas somente editores autorizados podem enviar ou alterar arquivos.
- A chave `anon` no site não concede permissão para editar notícias. Nunca coloque uma chave `service_role` no navegador nem compartilhe sua senha.
- O mesmo painel permite criar, editar e ativar/desativar enquetes, prêmios e jogos, além de registrar ou corrigir o placar final. Execute novamente `supabase-setup.sql` para aplicar as permissões e adicionar o campo de ordenação da enquete. Somente editores cadastrados em `news_admins` podem alterar esses itens e registrar placares pela página administrativa; os visitantes continuam podendo ler apenas os registros ativos. Desativar um item mantém seus votos e palpites.
- Na seção de participação, **Zerar votos ativos** apaga permanentemente os votos da enquete e dos prêmios ativos, sem apagar votos de itens inativos ou palpites de placar. A ação exige confirmação e retorna a quantidade apagada. Execute novamente `supabase-setup.sql` para instalar a função protegida do banco.

## Contas da liga e placares

- A enquete e os prêmios continuam abertos: qualquer visitante pode votar sem entrar. O site usa um identificador local do navegador para evitar votos repetidos por uso comum, mas isso não é uma verificação de identidade.
- Só os palpites da liga exigem conta. Novas contas entram com Google e escolhem um apelido público único na primeira entrada; o e-mail Google não aparece no site. Isso evita o envio de e-mail de confirmação do Supabase, mas não remove outros limites de autenticação do Supabase nem os limites do Google.
- O login por e-mail e senha permanece recolhido na página apenas para usuários que já têm uma conta antiga com palpites ou pontos. Não há mais criação de novas contas por e-mail no site.
- O login Google não transfere automaticamente dados de uma conta antiga. Usuários antigos devem continuar usando temporariamente **Entrar com e-mail** para acessar os palpites vinculados à conta; não presuma que um endereço igual vai vincular identidades. Contas Supabase diferentes não compartilham palpites nem pontos.
- Para tornar **uma conta** administradora dos placares no site, primeiro crie a conta pelo site e confirme o e-mail. Em **Authentication → Users**, copie o UUID dessa conta. No SQL Editor, execute o comando abaixo substituindo o UUID pelo valor copiado. Editores registrados em `news_admins` também podem registrar placares pela página administrativa:

  ```sql
  insert into public.score_admins (user_id)
  values ('COLE-AQUI-O-UUID-DA-CONTA')
  on conflict (user_id) do nothing;
  ```

- Entre nessa conta no site. A área **Registrar placar final** aparecerá dentro da caixa de previsões somente para ela. Os demais visitantes não podem gravar ou alterar resultados.
- A pontuação acumula por conta em todos os jogos: **3 pontos** por placar exato e **1 ponto** por acertar vitória/empate/derrota. Palpites antigos feitos antes das contas não entram nessa liga; são mantidos no banco, mas ficam fora do ranking novo.

## Uso e limitações

- Cada navegador pode registrar um voto por enquete/prêmio. Como não há login para esses votos, apagar os dados ou usar outro dispositivo permite votar de novo.
- O apelido aparece publicamente no ranking; não use nomes completos nem compartilhe a senha.
- O ranking só pontua jogos com placar final preenchido: **3 pontos** por placar exato e **1 ponto** por acertar vitória/empate/derrota.
- Os palpites encerram às **11h no dia do jogo**, no horário de Brasília (America/Sao_Paulo), usando `match_date`. O banco também bloqueia envios após esse horário, mesmo se a página permanecer aberta.
- Enquetes e prêmios encerram toda sexta-feira às **15h30**, no horário de Brasília (America/Sao_Paulo), calculado a partir da segunda-feira definida em `week_start`. Ao cadastrar uma nova semana, informe a segunda-feira correspondente nesse campo. O banco recusa novos votos depois do prazo; se a página estiver aberta, ela atualiza a votação automaticamente e identifica o vencedor do prêmio. Se não estiver aberta, o resultado aparece quando alguém visitar ou atualizar o site.
- A página pública mostra a enquete ativa cuja `week_start` é mais recente; em caso de empate, mostra a criada mais recentemente. Para reabrir uma enquete existente, edite-a, marque **Ativa no site** e ajuste a semana para uma segunda-feira cujo prazo ainda não tenha passado. Os votos existentes são mantidos. Para uma enquete nova, use **Nova enquete**, preencha pergunta e opções, marque-a ativa e escolha a segunda-feira da semana atual (ou a próxima, se o prazo já encerrou).
- Não há reabertura automática. Para uma nova semana, cadastre novas enquetes/prêmios e um novo jogo, atualize as datas e deixe os registros ativos; desative os antigos se não quiser mostrá-los. Uma enquete nova criada depois da anterior será exibida primeiro quando a semana for a mesma. Se apenas estender o prazo de um registro existente, altere `week_start` (enquete/prêmio) ou `match_date` (jogo): votos e palpites já enviados serão mantidos, e cada pessoa poderá editar o próprio registro enquanto estiver aberto. Para iniciar palpites de outra partida depois que um jogo já tem resultado, use **Novo jogo** e cadastre um novo jogo ativo com data futura.
- A votação dos prêmios mostra quem está liderando antes do encerramento e quem venceu depois.
- O conteúdo de exemplo é apenas um ponto de partida. Troque os times, indicados, pergunta e opções antes de divulgar a votação.
- Cada prêmio aceita de 2 a 3 indicados. Para atualizar o prêmio de craque que já foi criado, abra o **SQL Editor** no Supabase e execute este comando, trocando os exemplos pelos nomes reais:

  ```sql
  update public.weekly_awards
  set nominees = array['Craque 1', 'Craque 2', 'Craque 3']
  where id = 'craque-da-semana';
  ```

  Para deixar somente dois indicados, remova o terceiro nome do array.
