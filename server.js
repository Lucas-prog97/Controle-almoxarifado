const express = require('express');
const mysql = require('mysql2');
const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const multer = require('multer');
const path = require('path');

// Configuração do upload de imagens
const storage = multer.diskStorage({
  destination: './Imagens/itens/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Servir arquivos estáticos da pasta Imagens
app.use('/Imagens', express.static(path.join(__dirname, 'Imagens')));

// Servir todos os arquivos estáticos do diretório raiz, incluindo dashboard.html
app.use(express.static(__dirname));

// Configuração do banco de dados
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Abc123!@senai',
  database: 'meu_projeto'
});

connection.connect((err) => {
  if (err) {
    console.error('Erro ao conectar ao MySQL:', err);
    throw err;
  }
  console.log('Conectado ao MySQL!');
});

// Criar tabela de usuários se não existir
connection.query(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(50) NOT NULL,
    role ENUM('admin', 'user', 'developer') NOT NULL
  )
`, (err) => {
  if (err) {
    console.error('Erro ao criar tabela usuarios:', err);
    throw err;
  }
  connection.query("SELECT COUNT(*) as count FROM usuarios", (err, result) => {
    if (err) {
      console.error('Erro ao contar usuários:', err);
      throw err;
    }
    if (result[0].count === 0) {
      connection.query(`
        INSERT INTO usuarios (email, password, role) VALUES 
        ('admin@senairs.org.br', '1234', 'admin'),
        ('lucas.pacheco@senairs.org.br', 'lucas.2001', 'admin'),
        ('marcildo.camini@senairs.org.br', '1234', 'user'),
        ('dev@senairs.org.br', '1234', 'developer')
      `, (err) => {
        if (err) console.error('Erro ao inserir usuários iniciais:', err);
      });
    }
  });
});

// Criar tabela de itens se não existir
connection.query(`
  CREATE TABLE IF NOT EXISTS itens_almoxarifado (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    setor VARCHAR(100) NOT NULL,
    nome VARCHAR(100) NOT NULL,
    complemento VARCHAR(255) NOT NULL,
    unidade ENUM('UN', 'KG') NOT NULL,
    qtd_inicial INT NOT NULL DEFAULT 0,
    qtd_minima INT DEFAULT 0,
    imagem_path VARCHAR(255),
    observacao TEXT,
    fornecedor VARCHAR(100),
    nota_fiscal VARCHAR(100),
    created_by VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Erro ao criar tabela itens_almoxarifado:', err);
    throw err;
  }
  console.log('Tabela itens_almoxarifado criada ou já existente.');
});

// Rota de login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  connection.query(
    'SELECT * FROM usuarios WHERE email = ? AND password = ?',
    [email, password],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length > 0) {
        res.json({ success: true, role: results[0].role, email: results[0].email });
      } else {
        res.status(401).json({ success: false, message: 'Usuário ou senha inválidos' });
      }
    }
  );
});

// Rota para cadastrar usuário (só admins)
app.post('/api/register', (req, res) => {
  const { email, password, role, requesterEmail } = req.body;

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem cadastrar usuários' });
      }

      connection.query(
        'INSERT INTO usuarios (email, password, role) VALUES (?, ?, ?)',
        [email, password, role],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, message: 'Usuário cadastrado com sucesso' });
        }
      );
    }
  );
});

// Rota para listar usuários (só admins)
app.get('/api/users', (req, res) => {
  const { requesterEmail } = req.query;

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem listar usuários' });
      }

      connection.query(
        'SELECT id, email, role FROM usuarios WHERE email != ?',
        [requesterEmail],
        (err, results) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, users: results });
        }
      );
    }
  );
});

// Rota para excluir usuário (só admins)
app.post('/api/delete-user', (req, res) => {
  const { userEmail, requesterEmail } = req.body;

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem excluir usuários' });
      }

      if (userEmail === requesterEmail) {
        return res.status(400).json({ success: false, message: 'Você não pode excluir a si mesmo' });
      }

      connection.query(
        'DELETE FROM usuarios WHERE email = ?',
        [userEmail],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, message: 'Usuário excluído com sucesso' });
        }
      );
    }
  );
});

// Rota para listar itens
app.get('/api/itens', (req, res) => {
  connection.query('SELECT * FROM itens_almoxarifado', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Rota para adicionar item (só admins)
app.post('/api/add-item', upload.single('imagem'), (req, res) => {
  const { codigo, setor, nome, complemento, unidade, qtdInicial, qtdMinima, observacao, fornecedor, notaFiscal, requesterEmail } = req.body;
  console.log('Dados recebidos para item:', { codigo, setor, nome, complemento, unidade, qtdInicial, qtdMinima, observacao, fornecedor, notaFiscal, requesterEmail }); // Debug

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem cadastrar itens' });
      }

      // Verificação de código duplicado
      connection.query('SELECT id FROM itens_almoxarifado WHERE codigo = ?', [codigo], (err, dupResults) => {
        if (err) return res.status(500).json({ error: err.message });
        if (dupResults.length > 0) {
          return res.status(400).json({ success: false, message: 'Código já existe. Use um código único.' });
        }

        const imagemPath = req.file ? `Imagens/itens/${req.file.filename}` : null; // Sem / inicial
        console.log('Arquivo recebido:', req.file); // Debug do arquivo
        console.log('Caminho da imagem:', imagemPath); // Debug
        connection.query(
          'INSERT INTO itens_almoxarifado (codigo, setor, nome, complemento, unidade, qtd_inicial, qtd_minima, imagem_path, observacao, fornecedor, nota_fiscal, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [codigo, setor, nome, complemento, unidade, qtdInicial, qtdMinima || 0, imagemPath, observacao || null, fornecedor || null, notaFiscal || null, requesterEmail],
          (err) => {
            if (err) {
              console.error('Erro na INSERT:', err); // Debug no terminal
              return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: 'Item cadastrado com sucesso' });
          }
        );
      });
    }
  );
});

// Rota para adicionar estoque (só admins)
app.post('/api/add-stock', (req, res) => {
  const { itemId, quantity, requesterEmail } = req.body;
  console.log('Dados recebidos para entrada:', { itemId, quantity, requesterEmail }); // Debug

  // Verifica se o usuário é admin
  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem adicionar estoque' });
      }

      // Verifica se o item existe
      connection.query(
        'SELECT qtd_inicial FROM itens_almoxarifado WHERE id = ?',
        [itemId],
        (err, results) => {
          if (err) return res.status(500).json({ error: err.message });
          if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Item não encontrado' });
          }

          const currentQuantity = results[0].qtd_inicial;
          const newQuantity = currentQuantity + parseInt(quantity, 10);

          // Atualiza a quantidade
          connection.query(
            'UPDATE itens_almoxarifado SET qtd_inicial = ? WHERE id = ?',
            [newQuantity, itemId],
            (err) => {
              if (err) return res.status(500).json({ error: err.message });
              res.json({ success: true, message: 'Estoque atualizado com sucesso', newQuantity });
            }
          );
        }
      );
    }
  );
});

// Rota para remover estoque (só admins)
app.post('/api/remove-stock', (req, res) => {
  const { itemId, quantity, requesterEmail } = req.body;
  console.log('Dados recebidos para baixa:', { itemId, quantity, requesterEmail }); // Debug

  // Verifica se o usuário é admin
  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem remover estoque' });
      }

      // Verifica se o item existe
      connection.query(
        'SELECT qtd_inicial FROM itens_almoxarifado WHERE id = ?',
        [itemId],
        (err, results) => {
          if (err) return res.status(500).json({ error: err.message });
          if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Item não encontrado' });
          }

          const currentQuantity = results[0].qtd_inicial;
          const requestedQuantity = parseInt(quantity, 10);
          if (requestedQuantity > currentQuantity) {
            return res.status(400).json({ success: false, message: 'Quantidade a remover excede o estoque atual' });
          }

          const newQuantity = currentQuantity - requestedQuantity;

          // Atualiza a quantidade
          connection.query(
            'UPDATE itens_almoxarifado SET qtd_inicial = ? WHERE id = ?',
            [newQuantity, itemId],
            (err) => {
              if (err) return res.status(500).json({ error: err.message });
              res.json({ success: true, message: 'Estoque removido com sucesso', newQuantity });
            }
          );
        }
      );
    }
  );
});

// Rota para obter e atualizar item (só admins)
app.post('/api/update-item', upload.single('imagem'), (req, res) => {
  const { id, codigo, setor, nome, complemento, unidade, qtdInicial, qtdMinima, observacao, fornecedor, notaFiscal, requesterEmail } = req.body;
  const imagemPath = req.file ? `Imagens/itens/${req.file.filename}` : null;

  connection.query(
    'SELECT role FROM usuarios WHERE email = ?',
    [requesterEmail],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas admins podem editar itens' });
      }

      // Verifica se o item existe
      connection.query(
        'SELECT * FROM itens_almoxarifado WHERE id = ?',
        [id],
        (err, results) => {
          if (err) return res.status(500).json({ error: err.message });
          if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Item não encontrado' });
          }

          // Verifica duplicata de código (exceto se for o mesmo item)
          if (results[0].codigo !== codigo) {
            connection.query(
              'SELECT id FROM itens_almoxarifado WHERE codigo = ? AND id != ?',
              [codigo, id],
              (err, dupResults) => {
                if (err) return res.status(500).json({ error: err.message });
                if (dupResults.length > 0) {
                  return res.status(400).json({ success: false, message: 'Código já existe. Use um código único.' });
                }

                updateItemInDatabase();
              }
            );
          } else {
            updateItemInDatabase();
          }

          function updateItemInDatabase() {
            connection.query(
              'UPDATE itens_almoxarifado SET codigo = ?, setor = ?, nome = ?, complemento = ?, unidade = ?, qtd_inicial = ?, qtd_minima = ?, imagem_path = ?, observacao = ?, fornecedor = ?, nota_fiscal = ? WHERE id = ?',
              [codigo, setor, nome, complemento, unidade, qtdInicial, qtdMinima || 0, imagemPath || results[0].imagem_path, observacao || null, fornecedor || null, notaFiscal || null, id],
              (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Item atualizado com sucesso' });
              }
            );
          }
        }
      );
    }
  );
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});