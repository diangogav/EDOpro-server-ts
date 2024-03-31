import express, { Request, Response } from 'express';


const app = express();
const PORT = 3000;


app.use(express.json());

export class ServerMessagesController {
    private message: string = '';

  
    public postMessage(req: Request, res: Response): void {
      
        const { message } = req.body;

       
        this.message = message;

      
        res.json({ success: true, message: 'Message received successfully.' });
    }

    
    public getMessage(req: Request, res: Response): void {
       
        res.json({ message: this.message });
    }
}


const serverMessagesController = new ServerMessagesController();


app.post('/server/message', (req, res) => serverMessagesController.postMessage(req, res));


app.get('/server/message', (req, res) => serverMessagesController.getMessage(req, res));


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
